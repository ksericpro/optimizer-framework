import psycopg2
from api.db_config import get_db_params

def reset_orders():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    cur.execute("UPDATE orders SET status = 'PENDING'")
    cur.execute("DELETE FROM route_stops")
    cur.execute("DELETE FROM routes")
    conn.commit()
    cur.close()
    conn.close()
    print("Orders reset to PENDING and existing routes cleared.")

if __name__ == "__main__":
    reset_orders()
