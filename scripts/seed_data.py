import psycopg2
import uuid
import random
from datetime import datetime, timedelta

# Database connection parameters
DB_PARAMS = {
    "host": "localhost",
    "port": 15433,
    "database": "optimizer_db",
    "user": "optimizer_user",
    "password": "optimizer_password"
}

def seed_data():
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        print("Connected to database successfully.")

        # 1. Seed Vehicles
        vehicles = [
            ('PLATE-001', 'VAN', 500.0, 10.0),
            ('PLATE-002', 'TRUCK', 2000.0, 40.0),
            ('PLATE-003', 'BIKE', 20.0, 0.5)
        ]
        
        vehicle_ids = []
        for plate, vtype, weight, vol in vehicles:
            cur.execute(
                "INSERT INTO vehicles (plate_number, type, capacity_weight, capacity_volume) VALUES (%s, %s, %s, %s) RETURNING id",
                (plate, vtype, weight, vol)
            )
            vehicle_ids.append(cur.fetchone()[0])
        print(f"Inserted {len(vehicle_ids)} vehicles.")

        # 2. Seed Drivers
        drivers = [
            ('John Doe', '+1234567890', 25),
            ('Jane Smith', '+1987654321', 15),
            ('Bob Wilson', '+1122334455', 30)
        ]
        
        driver_ids = []
        for name, phone, max_jobs in drivers:
            cur.execute(
                "INSERT INTO drivers (full_name, phone_number, max_jobs_per_day) VALUES (%s, %s, %s) RETURNING id",
                (name, phone, max_jobs)
            )
            driver_ids.append(cur.fetchone()[0])
        print(f"Inserted {len(driver_ids)} drivers.")

        # 3. Seed Orders (around a central point, e.g., NYC)
        # Center: 40.7128, -74.0060 (NYC)
        center_lat, center_lng = 40.7128, -74.0060
        
        for i in range(50):
            ext_id = f"ORD-{1000 + i}"
            address = f"{random.randint(1, 999)} Sample St, New York, NY"
            # Random offset ~5-10km
            lat = center_lat + random.uniform(-0.05, 0.05)
            lng = center_lng + random.uniform(-0.05, 0.05)
            weight = round(random.uniform(0.5, 50.0), 2)
            volume = round(random.uniform(0.01, 1.0), 2)
            
            # Time windows (Today)
            start_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(hours=random.randint(0, 4))
            end_time = start_time + timedelta(hours=random.randint(2, 6))
            
            cur.execute(
                """INSERT INTO orders 
                   (external_order_id, customer_id, delivery_address, lat, lng, weight, volume, time_window_start, time_window_end, priority) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (ext_id, f"CUST-{random.randint(100, 999)}", address, lat, lng, weight, volume, start_time, end_time, random.randint(1, 3))
            )

        conn.commit()
        print(f"Successfully inserted 50 sample orders.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    seed_data()
