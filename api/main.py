from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
from scripts.optimizer_prototype import run_optimization
from scripts.data_model_loop import run_data_model_loop
from api.logger_config import logger
from api.db_config import get_db_params
from datetime import datetime, timedelta
from typing import Optional

# Auth Configuration
SECRET_KEY = "super-secret-key-change-this-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_driver(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        driver_id: str = payload.get("sub")
        if driver_id is None:
            raise credentials_exception
        return driver_id
    except JWTError:
        raise credentials_exception

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

# Serve Frontend
app.mount("/dashboard", StaticFiles(directory="frontend", html=True), name="frontend")

@app.get("/")
async def root():
    return {"message": "Delivery Optimizer API is running"}


@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM drivers WHERE username = %s", (form_data.username,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not verify_password(form_data.password, user['password_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user['id'])})
    return {"access_token": access_token, "token_type": "bearer", "driver_id": user['id']}


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


@app.get("/routes/today")
async def get_all_routes_today():
    """Fetches all planned routes and stops for the dashboard."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT r.id as route_id, r.driver_id, d.full_name, r.status
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.planned_date = CURRENT_DATE
        """)
        routes = cur.fetchall()
        
        results = []
        for route in routes:
            cur.execute("""
                SELECT rs.id as stop_id, rs.sequence_number, rs.estimated_arrival_time, 
                       rs.status as stop_status, o.delivery_address, o.lat, o.lng, o.priority
                FROM route_stops rs
                JOIN orders o ON rs.order_id = o.id
                WHERE rs.route_id = %s
                ORDER BY rs.sequence_number
            """, (route['route_id'],))
            stops = cur.fetchall()
            results.append({**route, "stops": stops})
            
        cur.close()
        conn.close()
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/drivers/{driver_id}/route")
async def get_driver_route(driver_id: str, current_driver: str = Depends(get_current_driver)):
    """Fetches the planned route and stops for a specific driver for today."""
    # Security: Ensure driver can only see their own route
    if current_driver != driver_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this route")
        
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
async def update_stop_status(stop_id: str, status: str, current_driver: str = Depends(get_current_driver)):
    """Updates the status of a specific stop (e.g., set to 'DELIVERED')."""
    valid_statuses = ['ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED']
    if status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")
        
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # Security: Verify the stop belongs to the current driver's route
        cur.execute("""
            SELECT d.id FROM drivers d
            JOIN routes r ON r.driver_id = d.id
            JOIN route_stops rs ON rs.route_id = r.id
            WHERE rs.id = %s
        """, (stop_id,))
        stop_owner = cur.fetchone()
        
        if not stop_owner or str(stop_owner['id']) != current_driver:
             raise HTTPException(status_code=403, detail="Not authorized to update this stop")

        cur.execute("UPDATE route_stops SET status = %s WHERE id = %s", (status.upper(), stop_id))
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Stop not found")
            
        conn.commit()
        cur.close()
        conn.close()
        
        return {"message": "Status updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/drivers/{driver_id}/location")
async def update_driver_location(driver_id: str, lat: float, lng: float, current_driver: str = Depends(get_current_driver)):
    """Updates the last known location of a driver."""
    if current_driver != driver_id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE drivers SET last_known_lat = %s, last_known_lng = %s WHERE id = %s",
            (lat, lng, driver_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Driver not found")
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Location updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/drivers/locations")
async def get_all_driver_locations():
    """Fetches the latest locations of all active drivers."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, full_name, last_known_lat, last_known_lng FROM drivers WHERE is_active = TRUE")
        drivers = cur.fetchall()
        cur.close()
        conn.close()
        return drivers
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
