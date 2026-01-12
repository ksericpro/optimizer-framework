import psycopg2
import requests
import time
import math
from api.db_config import get_db_params

API_BASE = "http://localhost:8011"

def get_driver_tokens():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    cur.execute("SELECT username FROM drivers WHERE username IS NOT NULL")
    usernames = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()
    
    tokens = {}
    for user in usernames:
        try:
            res = requests.post(f"{API_BASE}/login", data={"username": user, "password": "password123"})
            if res.ok:
                data = res.json()
                tokens[data['driver_id']] = data['access_token']
                print(f"Logged in as {user}")
        except Exception as e:
            print(f"Failed to login as {user}: {e}")
    return tokens

def get_routes():
    params = get_db_params()
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT r.id, r.driver_id, d.full_name
        FROM routes r
        JOIN drivers d ON r.driver_id = d.id
        WHERE r.planned_date = CURRENT_DATE
    """)
    routes = cur.fetchall()
    
    route_data = []
    for r_id, d_id, d_name in routes:
        cur.execute("""
            SELECT o.lat, o.lng, rs.sequence_number
            FROM route_stops rs
            JOIN orders o ON rs.order_id = o.id
            WHERE rs.route_id = %s
            ORDER BY rs.sequence_number
        """, (r_id,))
        stops = cur.fetchall()
        
        full_path = [(1.3521, 103.8198)] + [(s[0], s[1]) for s in stops]
        route_data.append({
            "driver_id": str(d_id),
            "name": d_name,
            "path": full_path
        })
    
    cur.close()
    conn.close()
    return route_data

def interpolate(p1, p2, t):
    return (
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t
    )

def run_simulation():
    print("Starting driver simulation with Auth...")
    tokens = get_driver_tokens()
    routes = get_routes()
    
    if not routes:
        print("No routes found for today.")
        return

    steps_between_stops = 20
    delay = 0.2

    while True:
        max_steps = steps_between_stops * (max(len(r['path']) for r in routes) - 1)
        for step in range(max_steps):
            for r in routes:
                d_id = r['driver_id']
                if d_id not in tokens: continue
                
                path = r['path']
                seg_idx = step // steps_between_stops
                if seg_idx >= len(path) - 1: continue
                
                t = (step % steps_between_stops) / steps_between_stops
                curr_lat, curr_lng = interpolate(path[seg_idx], path[seg_idx+1], t)
                
                headers = {"Authorization": f"Bearer {tokens[d_id]}"}
                try:
                    requests.patch(f"{API_BASE}/drivers/{d_id}/location?lat={curr_lat}&lng={curr_lng}", headers=headers)
                except Exception as e:
                    pass # Silent fail for simulation
            
            time.sleep(delay)
        print("Looping simulation...")

if __name__ == "__main__":
    run_simulation()
