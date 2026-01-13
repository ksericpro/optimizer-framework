from api.db_config import get_db_params
import psycopg2

def migrate():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE orders ADD COLUMN contact_person VARCHAR(100);")
        cur.execute("ALTER TABLE orders ADD COLUMN contact_mobile VARCHAR(20);")
        # Also need a 'fail_reason' for route_stops if we want to track why it failed
        cur.execute("ALTER TABLE route_stops ADD COLUMN fail_reason TEXT;")
        conn.commit()
        print("Migrated orders and route_stops successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    migrate()
