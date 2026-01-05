import psycopg2
from api.db_config import get_db_params

def get_ids():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    cur.execute("SELECT id FROM drivers")
    with open("driver_ids.txt", "w") as f:
        for row in cur.fetchall():
            f.write(str(row[0]) + "\n")
    cur.close()
    conn.close()

if __name__ == "__main__":
    get_ids()
