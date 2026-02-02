import requests
import os
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

def get_data_from_db(planned_date=None):
    conn = psycopg2.connect(**DB_PARAMS)
    
    # Fetch warehouse/depot location
    cur = conn.cursor()
    cur.execute("SELECT lat, lng, name FROM warehouse WHERE is_default = TRUE LIMIT 1")
    warehouse_row = cur.fetchone()
    if warehouse_row:
        depot_lat, depot_lng, depot_name = warehouse_row
        logger.info(f"Using warehouse: {depot_name} ({depot_lat}, {depot_lng})")
    else:
        # Default fallback location (Singapore CBD)
        depot_lat, depot_lng, depot_name = 1.2897, 103.8501, "Default Depot"
        logger.warning("No warehouse found, using default depot location")
    cur.close()
    
    # Fetch orders with demands
    query_orders = """
        SELECT id, lat, lng, time_window_start, time_window_end, weight, volume
        FROM orders 
        WHERE status = 'PENDING'
        ORDER BY created_at DESC 
        LIMIT 100
    """
    orders = pd.read_sql(query_orders, conn)
    
    # 1. Identify if this date belongs to a managed Period
    period_id = None
    if planned_date:
        cur = conn.cursor()
        cur.execute("SELECT id FROM periods WHERE %s BETWEEN start_date AND end_date LIMIT 1", (planned_date,))
        row = cur.fetchone()
        if row:
            period_id = row[0]
        cur.close()

    # 2. Fetch drivers. If assigned to a period, only those. Else all active with vehicles.
    if period_id:
        query_drivers = """
            SELECT d.id, d.full_name, d.max_jobs_per_day,
                   v.capacity_weight, v.capacity_volume
            FROM drivers d
            JOIN driver_period_assignments dpa ON d.id = dpa.driver_id
            JOIN vehicles v ON d.assigned_vehicle_id = v.id
            WHERE dpa.period_id = %s AND d.is_active = TRUE AND v.is_active = TRUE
        """
        drivers = pd.read_sql(query_drivers, conn, params=(period_id,))
    else:
        # Fallback to all active drivers with assigned in-service vehicles
        query_drivers = """
            SELECT d.id, d.full_name, d.max_jobs_per_day,
                   v.capacity_weight, v.capacity_volume
            FROM drivers d
            JOIN vehicles v ON d.assigned_vehicle_id = v.id
            WHERE d.is_active = TRUE AND v.is_active = TRUE
        """
        drivers = pd.read_sql(query_drivers, conn)
        
    conn.close()
    return orders, drivers, (depot_lat, depot_lng)

def create_data_model(orders, drivers, depot_location):
    data = {}
    depot_lat, depot_lng = depot_location
    
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
    data['vehicle_capacities_weight'] = [int(c) for c in drivers['capacity_weight'].tolist()]
    data['vehicle_capacities_volume'] = [int(c) for c in drivers['capacity_volume'].tolist()]
    
    base_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    
    time_windows = [(0, 1440)]
    for _, row in orders.iterrows():
        # Default window: 8 AM to 8 PM (0 to 720 minutes from base_time)
        try:
            if row['time_window_start'] and row['time_window_end']:
                start_min = int((row['time_window_start'].replace(tzinfo=None) - base_time).total_seconds() / 60)
                end_min = int((row['time_window_end'].replace(tzinfo=None) - base_time).total_seconds() / 60)
            else:
                start_min, end_min = 0, 720
        except:
            start_min, end_min = 0, 720
            
        time_windows.append((max(0, start_min), max(start_min + 30, end_min)))
    
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
    osrm_host = os.getenv("OSRM_HOST", "localhost")
    url = f"http://{osrm_host}:5000/table/v1/driving/{coords}?annotations=duration"
    
    try:
        response = requests.get(url, timeout=30)
        data = response.json()
        if data['code'] != 'Ok':
            logger.error(f"OSRM Error: {data.get('message', 'Unknown error')}")
            return None
        
        # OSRM returns durations in seconds. Convert to minutes.
        durations = data['durations']
        matrix = []
        for row in durations:
            matrix.append([int((d or 9999) / 60) for d in row])
        return matrix
    except Exception as e:
        logger.error(f"Failed to fetch OSRM matrix: {e}")
        return None

def run_optimization(planned_date=None):
    """Main function to fetch data, build model, and solve the routing problem."""
    import traceback
    try:
        if planned_date is None:
            planned_date = datetime.now().date()
        elif isinstance(planned_date, str):
            planned_date = datetime.strptime(planned_date, "%Y-%m-%d").date()

        orders, drivers, depot_location = get_data_from_db(planned_date=planned_date)
        if orders.empty:
            logger.warning("No pending orders found for optimization.")
            return {"status": "error", "message": "No pending orders found"}
        if drivers.empty:
            logger.warning("No active drivers found for optimization.")
            return {"status": "error", "message": "No active drivers available"}

        logger.info(f"Starting optimization for {len(orders)} orders and {len(drivers)} drivers for date {planned_date}.")

        data = create_data_model(orders, drivers, depot_location)
        manager = pywrapcp.RoutingIndexManager(data['num_locations'], data['num_vehicles'], data['depot'])
        routing = pywrapcp.RoutingModel(manager)

        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            travel_time = data['time_matrix'][from_node][to_node]
            if from_node == 0:
                return int(travel_time)
            return int(travel_time + data['service_time'])

        transit_callback_index = routing.RegisterTransitCallback(time_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        routing.AddDimension(
            transit_callback_index,
            30,  # allow waiting time
            1440, # maximum time per vehicle
            False, # start cumul to zero
            'Time'
        )
        time_dimension = routing.GetDimensionOrDie('Time')
        for location_idx, time_window in enumerate(data['time_windows']):
            if location_idx == 0: continue
            index = manager.NodeToIndex(location_idx)
            time_dimension.CumulVar(index).SetRange(int(time_window[0]), int(time_window[1]))

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

        penalty = 10000
        for node in range(1, data['num_locations']):
            routing.AddDisjunction([int(manager.NodeToIndex(node))], int(penalty))

        # Setting first solution heuristic.
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
        search_parameters.time_limit.seconds = 5

        solution = routing.SolveWithParameters(search_parameters)

        if solution:
            return save_solution(data, manager, routing, solution, drivers, orders, planned_date)
        else:
            return {"status": "error", "message": "No solution found"}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

def save_solution(data, manager, routing, solution, drivers, orders, planned_date):
    time_dimension = routing.GetDimensionOrDie('Time')
    base_time = datetime.combine(planned_date, datetime.min.time()).replace(hour=8, minute=0, second=0, microsecond=0)
    
    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor()
    
    cur.execute("DELETE FROM routes WHERE planned_date = %s", (planned_date,))
    
    routes_created = 0
    stops_created = 0

    for vehicle_id in range(data['num_vehicles']):
        index = routing.Start(vehicle_id)
        driver = drivers.iloc[vehicle_id]
        
        if routing.IsEnd(solution.Value(routing.NextVar(index))):
            continue

        cur.execute(
            "INSERT INTO routes (driver_id, planned_date, status) VALUES (%s, %s, %s) RETURNING id",
            (driver['id'], planned_date, 'PLANNED')
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
