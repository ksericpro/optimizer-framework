import psycopg2
from api.db_config import get_db_params

def update_schema_for_pod():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    
    try:
        print("Adding POD columns to route_stops...")
        cur.execute("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE")
        cur.execute("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS assigned_vehicle_id UUID REFERENCES vehicles(id)")
        cur.execute("ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS pod_photo_url TEXT")
        cur.execute("ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS pod_signature TEXT")
        conn.commit()
        print("Schema updated successfully.")
    except Exception as e:
        conn.rollback()
        print(f"Error updating schema: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    update_schema_for_pod()
