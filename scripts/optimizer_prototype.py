import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from api.logger_config import logger
from api.db_config import get_db_params
import psycopg2

# Database Connection
DB_PARAMS = get_db_params()

def get_data_from_db():
    conn = psycopg2.connect(**DB_PARAMS)
    # Fetch orders with demands
    query_orders = """
        SELECT id, lat, lng, time_window_start, time_window_end, weight, volume
        FROM orders 
        WHERE status = 'PENDING'
        ORDER BY created_at DESC 
        LIMIT 100
    """
    orders = pd.read_sql(query_orders, conn)
    
    # Fetch drivers and their assigned vehicle capacities
    query_drivers = """
        SELECT d.id, d.full_name, d.max_jobs_per_day,
               v.capacity_weight, v.capacity_volume
        FROM drivers d
        CROSS JOIN vehicles v -- Simplified: assuming available fleet
        WHERE d.is_active = TRUE AND v.is_active = TRUE
        LIMIT (SELECT COUNT(*) FROM drivers WHERE is_active = TRUE)
    """
    drivers = pd.read_sql(query_drivers, conn)
    conn.close()
    return orders, drivers

def create_data_model(orders, drivers):
    data = {}
    depot_lat, depot_lng = 1.3521, 103.8198
    
    locations = [(depot_lat, depot_lng)]
    data['demands_weight'] = [0] # depot
    data['demands_volume'] = [0]
    
    for _, row in orders.iterrows():
        locations.append((row['lat'], row['lng']))
        data['demands_weight'].append(row.get('weight', 1.0))
        data['demands_volume'].append(row.get('volume', 1.0))
    
    data['locations'] = locations
    data['num_locations'] = len(locations)
    data['num_vehicles'] = len(drivers)
    data['depot'] = 0
    data['vehicle_capacities_weight'] = drivers['capacity_weight'].tolist()
    data['vehicle_capacities_volume'] = drivers['capacity_volume'].tolist()
    
    base_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    
    time_windows = [(0, 1440)]
    for _, row in orders.iterrows():
        start_min = int((row['time_window_start'].replace(tzinfo=None) - base_time).total_seconds() / 60)
        end_min = int((row['time_window_end'].replace(tzinfo=None) - base_time).total_seconds() / 60)
        time_windows.append((max(0, start_min), end_min))
    
    data['time_windows'] = time_windows
    data['service_time'] = 10
    
    # Replace Euclidean math with OSRM
    logger.info(f"Fetching {data['num_locations']}x{data['num_locations']} matrix from OSRM...")
    matrix = get_osrm_matrix(locations)
    
    if matrix is None:
        logger.warning("OSRM Matrix failed. Falling back to Euclidean (Simplified).")
        def travel_time(i, j):
            if i == j: return 0
            dist = np.sqrt((locations[i][0] - locations[j][0])**2 + 
                           (locations[i][1] - locations[j][1])**2)
            return int(dist * 500)

        matrix = []
        for i in range(data['num_locations']):
            row = []
            for j in range(data['num_locations']):
                row.append(travel_time(i, j))
            matrix.append(row)
    
    data['time_matrix'] = matrix
    return data

def get_osrm_matrix(locations):
    """
    Fetches the travel time matrix from OSRM.
    locations: List of (lat, lng) tuples
    Returns: 2D list of durations in minutes (rounded)
    """
    # OSRM expects {lng},{lat}
    coords = ";".join([f"{lng},{lat}" for lat, lng in locations])
    url = f"http://localhost:5000/table/v1/driving/{coords}?annotations=duration"
    
    try:
        response = requests.get(url)
        data = response.json()
        if data['code'] != 'Ok':
            logger.error(f"OSRM Error: {data.get('message', 'Unknown error')}")
            return None
        
        # OSRM returns durations in seconds. Convert to minutes.
        durations = data['durations']
        matrix = []
        for row in durations:
            matrix.append([int(d / 60) for d in row])
        return matrix
    except Exception as e:
        logger.error(f"Failed to fetch OSRM matrix: {e}")
        return None

def run_optimization():
    orders, drivers = get_data_from_db()
    if orders.empty:
        logger.warning("No pending orders found for optimization.")
        return {"status": "error", "message": "No pending orders found"}

    logger.info(f"Starting optimization for {len(orders)} orders and {len(drivers)} drivers.")

    data = create_data_model(orders, drivers)
    manager = pywrapcp.RoutingIndexManager(data['num_locations'], data['num_vehicles'], data['depot'])
    routing = pywrapcp.RoutingModel(manager)

    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel_time = data['time_matrix'][from_node][to_node]
        if from_node == 0:
            return travel_time
        return travel_time + data['service_time']

    transit_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    time_dimension_name = 'Time'
    routing.AddDimension(transit_callback_index, 1440, 1440, False, time_dimension_name)
    time_dimension = routing.GetDimensionOrDie(time_dimension_name)

    for location_idx, time_window in enumerate(data['time_windows']):
        if location_idx == 0: continue 
        index = manager.NodeToIndex(location_idx)
        time_dimension.CumulVar(index).SetRange(time_window[0], time_window[1])

    # 1. Capacity Constraints (Weight)
    def weight_callback(from_index):
        node = manager.IndexToNode(from_index)
        return int(data['demands_weight'][node])
    
    weight_callback_index = routing.RegisterUnaryTransitCallback(weight_callback)
    routing.AddDimensionWithVehicleCapacity(
        weight_callback_index, 0, data['vehicle_capacities_weight'], True, 'Weight'
    )

    # 2. Capacity Constraints (Volume)
    def volume_callback(from_index):
        node = manager.IndexToNode(from_index)
        return int(data['demands_volume'][node])
    
    volume_callback_index = routing.RegisterUnaryTransitCallback(volume_callback)
    routing.AddDimensionWithVehicleCapacity(
        volume_callback_index, 0, data['vehicle_capacities_volume'], True, 'Volume'
    )

    # 3. Driver Breaks (30 mins at 12:00 PM = 240 mins from 8 AM start)
    break_time = 30
    solver = routing.solver()
    for vehicle_id in range(data['num_vehicles']):
        # Optional: Add break interval at midday
        break_start = 240 # 12:00 PM
        break_var = solver.FixedDurationIntervalVar(break_start, break_start, break_time, False, 'Break')
        time_dimension.SetBreakIntervalsOfVehicle(
            [break_var],
            vehicle_id, []
        )

    penalty = 10000
    for node in range(1, data['num_locations']):
        routing.AddDisjunction([manager.NodeToIndex(node)], penalty)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    search_parameters.time_limit.seconds = 5

    solution = routing.SolveWithParameters(search_parameters)

    if solution:
        return save_solution(data, manager, routing, solution, drivers, orders)
    else:
        return {"status": "error", "message": "No solution found"}

def save_solution(data, manager, routing, solution, drivers, orders):
    time_dimension = routing.GetDimensionOrDie('Time')
    base_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    
    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor()
    
    today = datetime.now().date()
    cur.execute("DELETE FROM routes WHERE planned_date = %s", (today,))
    
    routes_created = 0
    stops_created = 0

    for vehicle_id in range(data['num_vehicles']):
        index = routing.Start(vehicle_id)
        driver = drivers.iloc[vehicle_id]
        
        if routing.IsEnd(solution.Value(routing.NextVar(index))):
            continue

        cur.execute(
            "INSERT INTO routes (driver_id, planned_date, status) VALUES (%s, %s, %s) RETURNING id",
            (driver['id'], today, 'PLANNED')
        )
        route_id = cur.fetchone()[0]
        routes_created += 1
        logger.info(f"Created route {route_id} for driver {driver['full_name']}")
        
        seq = 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                arr_min = solution.Min(time_dimension.CumulVar(index))
                est_arrival = base_time + timedelta(minutes=arr_min)
                order = orders.iloc[node-1]
                
                cur.execute(
                    """INSERT INTO route_stops (route_id, order_id, sequence_number, estimated_arrival_time, status) 
                       VALUES (%s, %s, %s, %s, %s)""",
                    (route_id, order['id'], seq, est_arrival, 'ASSIGNED')
                )
                cur.execute("UPDATE orders SET status = 'ASSIGNED' WHERE id = %s", (order['id'],))
                stops_created += 1

            index = solution.Value(routing.NextVar(index))
            seq += 1

    conn.commit()
    cur.close()
    conn.close()
    
    return {
        "status": "success", 
        "routes_generated": routes_created, 
        "orders_assigned": stops_created
    }

if __name__ == "__main__":
    result = run_optimization()
    print(result)
