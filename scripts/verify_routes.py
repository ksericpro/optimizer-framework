import psycopg2
import pandas as pd

DB_PARAMS = {
    "host": "localhost",
    "port": 15433,
    "database": "optimizer_db",
    "user": "optimizer_user",
    "password": "optimizer_password"
}

def verify_routes():
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        
        print("\n--- Routes Created Today ---")
        routes = pd.read_sql("SELECT id, driver_id, planned_date, status FROM routes", conn)
        print(routes)
        
        if not routes.empty:
            route_id = routes.iloc[0]['id']
            print(f"\n--- Stops for Route {route_id} ---")
            stops = pd.read_sql(f"""
                SELECT sequence_number, order_id, estimated_arrival_time, status 
                FROM route_stops 
                WHERE route_id = '{route_id}'
                ORDER BY sequence_number
            """, conn)
            print(stops)
            
            print("\n--- Updated Order Status ---")
            orders = pd.read_sql("SELECT id, status FROM orders WHERE status = 'ASSIGNED' LIMIT 5", conn)
            print(orders)

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_routes()
