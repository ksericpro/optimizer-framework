import psycopg2
import bcrypt
from api.db_config import get_db_params

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def setup_auth():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    
    # 1. Add columns if they don't exist
    try:
        cur.execute("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE")
        cur.execute("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS password_hash TEXT")
        conn.commit()
        print("Columns added successfully.")
    except Exception as e:
        conn.rollback()
        print(f"Error adding columns: {e}")

    # 2. Update existing drivers with default credentials
    password = "password123"
    hashed = hash_password(password)
    
    try:
        cur.execute("SELECT id, full_name FROM drivers")
        drivers = cur.fetchall()
        
        for driver_id, full_name in drivers:
            # Create a simple username from the first name
            username = full_name.split(' ')[0].lower()
            cur.execute(
                "UPDATE drivers SET username = %s, password_hash = %s WHERE id = %s",
                (username, hashed, driver_id)
            )
        
        conn.commit()
        print(f"Seed credentials set for {len(drivers)} drivers (password: password123).")
    except Exception as e:
        conn.rollback()
        print(f"Error seeding credentials: {e}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    setup_auth()
