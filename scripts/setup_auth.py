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
        # John Doe
        cur.execute("UPDATE drivers SET username = 'john', password_hash = %s WHERE full_name = 'John Doe'", (hashed,))
        # Jane Smith
        cur.execute("UPDATE drivers SET username = 'jane', password_hash = %s WHERE full_name = 'Jane Smith'", (hashed,))
        # Bob Wilson
        cur.execute("UPDATE drivers SET username = 'bob', password_hash = %s WHERE full_name = 'Bob Wilson'", (hashed,))
        
        conn.commit()
        print("Seed credentials set for drivers (password: password123).")
    except Exception as e:
        conn.rollback()
        print(f"Error seeding credentials: {e}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    setup_auth()
