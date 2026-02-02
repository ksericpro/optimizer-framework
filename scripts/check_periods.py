#!/usr/bin/env python3
"""
Check if periods exist in the database
"""
import psycopg2
from api.db_config import get_db_params

def check_periods():
    """List all periods in the database"""
    db_params = get_db_params()
    conn = psycopg2.connect(**db_params)
    cur = conn.cursor()
    
    try:
        cur.execute("SELECT * FROM periods ORDER BY created_at DESC")
        periods = cur.fetchall()
        
        if periods:
            print(f"✅ Found {len(periods)} period(s):")
            for p in periods:
                print(f"  - ID: {p[0]}")
                print(f"    Name: {p[1]}")
                print(f"    Start: {p[2]}")
                print(f"    End: {p[3]}")
                print(f"    Created: {p[4]}")
                print()
        else:
            print("❌ No periods found in database")
        
    except Exception as e:
        print(f"❌ Error checking periods: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    check_periods()
