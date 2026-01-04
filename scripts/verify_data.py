import psycopg2
import pandas as pd

DB_PARAMS = {
    "host": "localhost",
    "port": 15433,
    "database": "optimizer_db",
    "user": "optimizer_user",
    "password": "optimizer_password"
}

def verify_data():
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        
        print("\n--- Drivers ---")
        drivers = pd.read_sql("SELECT id, full_name, max_jobs_per_day FROM drivers", conn)
        print(drivers)
        
        print("\n--- Vehicles ---")
        vehicles = pd.read_sql("SELECT id, plate_number, type, capacity_weight FROM vehicles", conn)
        print(vehicles)
        
        print("\n--- Orders (First 5) ---")
        orders = pd.read_sql("SELECT id, external_order_id, delivery_address, lat, lng, weight FROM orders LIMIT 5", conn)
        print(orders)
        
        count = pd.read_sql("SELECT COUNT(*) FROM orders", conn).iloc[0,0]
        print(f"\nTotal orders in database: {count}")
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_data()
