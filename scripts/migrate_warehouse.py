"""
Migration script to add warehouse table to the database.
"""
import psycopg2
from api.db_config import get_db_params

def migrate():
    db_params = get_db_params()
    conn = psycopg2.connect(**db_params)
    cur = conn.cursor()
    
    try:
        # Create warehouse table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                address TEXT NOT NULL,
                lat FLOAT NOT NULL,
                lng FLOAT NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Insert a default warehouse (Singapore example)
        cur.execute("""
            INSERT INTO warehouse (name, address, lat, lng, is_default)
            VALUES ('Main Warehouse', '1 Jurong West Central 2, Singapore 648886', 1.3404, 103.7090, TRUE)
            ON CONFLICT DO NOTHING;
        """)
        
        conn.commit()
        print("✅ Warehouse table created successfully!")
        print("✅ Default warehouse added: Main Warehouse (Jurong West)")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    migrate()
