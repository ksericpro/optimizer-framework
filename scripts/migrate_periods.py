#!/usr/bin/env python3
"""
Migration script to add periods and driver_period_assignments tables
"""
import psycopg2
from api.db_config import get_db_params

def migrate():
    """Add periods and driver_period_assignments tables"""
    db_params = get_db_params()
    conn = psycopg2.connect(**db_params)
    cur = conn.cursor()
    
    try:
        print("Creating periods table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS periods (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        print("Creating driver_period_assignments table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS driver_period_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                period_id UUID REFERENCES periods(id) ON DELETE CASCADE,
                driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(period_id, driver_id)
            );
        """)
        
        conn.commit()
        print("✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    migrate()
