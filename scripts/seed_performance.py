import psycopg2
import uuid
import random
from datetime import datetime, timedelta

DB_PARAMS = {
    "host": "localhost",
    "port": 15433,
    "database": "optimizer_db",
    "user": "optimizer_user",
    "password": "optimizer_password"
}

def seed_performance():
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        
        # Get all drivers
        cur.execute("SELECT id, full_name FROM drivers")
        drivers = cur.fetchall()
        
        today = datetime.now().date()
        
        for driver_id, name in drivers:
            print(f"Seeding performance for {name}...")
            # Seed 7 days of history
            for i in range(1, 8):
                date = today - timedelta(days=i)
                
                # Create variation in performance
                if name == 'John Doe': # Good driver
                    orders = random.randint(22, 28)
                    avg_service = random.randint(7, 9)
                    delay = random.randint(0, 15)
                    efficiency = 0.9 + (random.random() * 0.1)
                elif name == 'Jane Smith': # Slower driver
                    orders = random.randint(10, 15)
                    avg_service = random.randint(12, 18)
                    delay = random.randint(30, 60)
                    efficiency = 0.6 + (random.random() * 0.2)
                else: # Average driver
                    orders = random.randint(18, 22)
                    avg_service = random.randint(10, 12)
                    delay = random.randint(10, 30)
                    efficiency = 0.75 + (random.random() * 0.15)

                cur.execute(
                    """INSERT INTO performance_metrics 
                       (driver_id, date, total_orders_completed, average_service_time, total_delay_minutes, efficiency_score) 
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (driver_id, date, orders, avg_service, delay, efficiency)
                )

        conn.commit()
        cur.close()
        conn.close()
        print("Performance metrics seeded successfully.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    seed_performance()
