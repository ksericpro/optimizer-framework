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
        vehicle_types = [('VAN', 500.0, 10.0), ('TRUCK', 2000.0, 40.0), ('BIKE', 20.0, 0.5)]
        vehicle_ids = []
        for i in range(10):
            vtype, weight, vol = random.choice(vehicle_types)
            plate = f"SGP-{100 + i}Z"
            cur.execute(
                "INSERT INTO vehicles (plate_number, type, capacity_weight, capacity_volume) VALUES (%s, %s, %s, %s) ON CONFLICT (plate_number) DO NOTHING RETURNING id",
                (plate, vtype, weight, vol)
            )
            result = cur.fetchone()
            if result:
                vehicle_ids.append(result[0])
        print(f"Inserted {len(vehicle_ids)} vehicles.")

        # 2. Seed Drivers
        driver_names = [
            'John Doe', 'Jane Smith', 'Bob Wilson', 'Alice Tan', 'Charlie Lim',
            'David Wong', 'Eve Ng', 'Frank Lee', 'Grace Seah', 'Henry Koh'
        ]
        
        driver_ids = []
        for i, name in enumerate(driver_names):
            phone = f"+65 {random.randint(80000000, 99999999)}"
            max_jobs = random.randint(15, 35)
            cur.execute(
                "INSERT INTO drivers (full_name, phone_number, max_jobs_per_day) VALUES (%s, %s, %s) RETURNING id",
                (name, phone, max_jobs)
            )
            driver_ids.append(cur.fetchone()[0])
        print(f"Inserted {len(driver_ids)} drivers.")

        # 3. Seed Orders (around a central point, e.g., Singapore)
        # Center: 1.3521, 103.8198 (Singapore)
        center_lat, center_lng = 1.3521, 103.8198
        
        for i in range(50):
            ext_id = f"ORD-{random.randint(2000, 99999)}"
            address = f"Blk {random.randint(1, 999)} Orchard Road, Singapore"
            # Random offset ~5-10km
            lat = center_lat + random.uniform(-0.08, 0.08)
            lng = center_lng + random.uniform(-0.08, 0.08)
            weight = round(random.uniform(0.5, 50.0), 2)
            volume = round(random.uniform(0.01, 1.0), 2)
            
            # Time windows (Today)
            start_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(hours=random.randint(0, 4))
            end_time = start_time + timedelta(hours=random.randint(2, 6))
            
            cur.execute(
                """INSERT INTO orders 
                   (external_order_id, customer_id, delivery_address, lat, lng, weight, volume, time_window_start, time_window_end, priority) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (external_order_id) DO NOTHING""",
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
