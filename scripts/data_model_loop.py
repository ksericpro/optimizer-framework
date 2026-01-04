import psycopg2
import pandas as pd
import math
from api.logger_config import logger
from api.db_config import get_db_params

DB_PARAMS = get_db_params()

def run_data_model_loop():
    """
    Analyzes historical performance to derive current-day parameters for the optimizer.
    This fulfills the requirement of the 'Data Model' in the system architecture.
    """
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        
        # 1. Fetch aggregate stats for the last 7 days
        query = """
            SELECT 
                driver_id,
                AVG(total_orders_completed) as avg_orders,
                AVG(average_service_time) as avg_service,
                AVG(efficiency_score) as avg_efficiency
            FROM performance_metrics
            WHERE date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY driver_id
        """
        stats = pd.read_sql(query, conn)
        
        if stats.empty:
            logger.warning("No recent performance data found. Skipping Data Model update.")
            return {"status": "success", "drivers_updated": 0}

        cur = conn.cursor()
        logger.info(f"Running Data Model Loop for {len(stats)} drivers...")
        
        updated_count = 0
        for _, row in stats.iterrows():
            base_capacity = row['avg_orders']
            efficiency_boost = 1.1 if row['avg_efficiency'] > 0.85 else 1.0
            new_max_jobs = math.ceil(base_capacity * efficiency_boost)
            
            cur.execute(
                "UPDATE drivers SET max_jobs_per_day = %s WHERE id = %s",
                (new_max_jobs, row['driver_id'])
            )
            updated_count += 1

        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Data Model Loop complete. Updated {updated_count} drivers.")
        return {"status": "success", "drivers_updated": updated_count}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    run_data_model_loop()
