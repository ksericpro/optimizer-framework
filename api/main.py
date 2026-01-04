from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
from scripts.optimizer_prototype import run_optimization
from scripts.data_model_loop import run_data_model_loop
from api.logger_config import logger
from api.db_config import get_db_params

app = FastAPI(title="Delivery Optimizer API")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

DB_PARAMS = get_db_params()

def get_db_conn():
    return psycopg2.connect(**DB_PARAMS, cursor_factory=RealDictCursor)

@app.get("/")
async def root():
    return {"message": "Delivery Optimizer API is running"}


@app.post("/optimize")
async def trigger_optimization():
    """Triggers the daily route optimization process, preceded by the Data Model loop."""
    logger.info("Triggering full optimization cycle...")
    # 1. Run Data Model Loop to update driver parameters from history
    dm_result = run_data_model_loop()
    if dm_result["status"] == "error":
        logger.error(f"Data Model Error: {dm_result['message']}")
        raise HTTPException(status_code=500, detail=f"Data Model Error: {dm_result['message']}")
    
    # 2. Run Route Optimizer
    opt_result = run_optimization()
    if opt_result["status"] == "error":
        logger.error(f"Optimizer Error: {opt_result['message']}")
        raise HTTPException(status_code=400, detail=f"Optimizer Error: {opt_result['message']}")
    
    logger.info("Optimization cycle completed successfully.")
        
    return {
        "data_model": dm_result,
        "optimizer": opt_result
    }


@app.get("/drivers/{driver_id}/route")
async def get_driver_route(driver_id: str):
    """Fetches the planned route and stops for a specific driver for today."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # Get the latest route for the driver
        cur.execute("""
            SELECT id, status, planned_date 
            FROM routes 
            WHERE driver_id = %s AND planned_date = CURRENT_DATE
            LIMIT 1
        """, (driver_id,))
        route = cur.fetchone()
        
        if not route:
            return {"route": None, "stops": []}
            
        # Get all stops for that route
        cur.execute("""
            SELECT rs.id as stop_id, rs.sequence_number, rs.estimated_arrival_time, 
                   rs.status as stop_status, o.delivery_address, o.lat, o.lng, o.priority
            FROM route_stops rs
            JOIN orders o ON rs.order_id = o.id
            WHERE rs.route_id = %s
            ORDER BY rs.sequence_number
        """, (route['id'],))
        stops = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return {
            "route_id": route['id'],
            "status": route['status'],
            "stops": stops
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/stops/{stop_id}/status")
async def update_stop_status(stop_id: str, status: str):
    """Updates the status of a specific stop (e.g., set to 'DELIVERED')."""
    valid_statuses = ['ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED']
    if status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")
        
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        cur.execute("UPDATE route_stops SET status = %s WHERE id = %s", (status.upper(), stop_id))
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Stop not found")
            
        conn.commit()
        cur.close()
        conn.close()
        
        return {"message": "Status updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
