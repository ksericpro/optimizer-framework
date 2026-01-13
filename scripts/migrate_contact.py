from api.db_config import get_db_params
import psycopg2

def migrate():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE drivers ADD COLUMN contact_number VARCHAR(20);")
        conn.commit()
        print("Migrated successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    migrate()
