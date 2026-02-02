from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, Request
from fastapi.responses import StreamingResponse, FileResponse
import io
import csv
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
import socketio
import asyncio
from jose import JWTError, jwt
import bcrypt
import psycopg2
from psycopg2 import errors
import os
import uuid
from psycopg2.extras import RealDictCursor
from scripts.optimizer_prototype import run_optimization
from scripts.data_model_loop import run_data_model_loop
from api.logger_config import logger
from api.db_config import get_db_params
from datetime import datetime, timedelta
from typing import Optional
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from api.config_loader import CONFIG

# Auth Configuration
SECRET_KEY = "super-secret-key-change-this-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

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
limiter = Limiter(key_func=get_remote_address, default_limits=[CONFIG["rate_limits"]["default"]])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Background Task for Risks
async def check_delivery_risks():
    """Periodically checks for late deliveries and capacity issues."""
    while True:
        try:
            conn = get_db_conn()
            cur = conn.cursor()
            
            # 1. Check for Late Deliveries
            cur.execute("""
                SELECT rs.id, o.delivery_address, r.driver_id, d.full_name, rs.estimated_arrival_time
                FROM route_stops rs
                JOIN orders o ON rs.order_id = o.id
                JOIN routes r ON rs.route_id = r.id
                JOIN drivers d ON r.driver_id = d.id
                WHERE rs.status = 'ASSIGNED' 
                AND rs.estimated_arrival_time < NOW() + INTERVAL '15 minutes'
                AND r.planned_date = CURRENT_DATE
            """)
            risks = cur.fetchall()
            
            for risk in risks:
                await sio.emit('alert', {
                    'type': 'LATE_RISK',
                    'message': f"Late Risk: Delivery to {risk['delivery_address']} for {risk['full_name']}",
                    'driver_id': str(risk['driver_id']),
                    'stop_id': str(risk['id'])
                })

            cur.close()
            conn.close()
        except Exception as e:
            print(f"Risk Monitor Error: {e}")
        
        await asyncio.sleep(60) # Check every minute

async def data_model_daily_task():
    """Runs the Data Model loop every day at midnight."""
    while True:
        now = datetime.now()
        # Calculate seconds until next midnight
        next_run = (now + timedelta(days=1)).replace(hour=0, minute=1, second=0, microsecond=0)
        wait_seconds = (next_run - now).total_seconds()
        
        logger.info(f"Data Model scheduled to run in {wait_seconds/3600:.2f} hours.")
        await asyncio.sleep(wait_seconds)
        
        try:
            logger.info("Starting scheduled daily Data Model run...")
            run_data_model_loop()
        except Exception as e:
            logger.error(f"Scheduled Data Model Error: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(check_delivery_risks())
    asyncio.create_task(data_model_daily_task())

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:3000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

DB_PARAMS = get_db_params()

def get_db_conn():
    return psycopg2.connect(**DB_PARAMS, cursor_factory=RealDictCursor)

# Serve Frontend
@app.get("/driver")
async def serve_driver():
    return FileResponse("frontend/driver.html")

@app.get("/dashboard")
async def serve_dashboard():
    return FileResponse("frontend/index.html")


@app.get("/liveness")
def liveness():
    """
    Define a liveness check endpoint.

    This route is used to verify that the API is operational and responding to requests.

    Returns:
        A simple string message indicating the API is working.
    """
    return 'API Works!'

@app.post("/admin/run-data-model")
async def manual_data_model_trigger():
    """Manually triggers the Data Model loop."""
    result = run_data_model_loop()
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    return result

# Create uploads directory if it doesn't exist
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.post("/login")
@limiter.limit(CONFIG["rate_limits"]["login"])
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM drivers WHERE username = %s", (form_data.username,))
    user = cur.fetchone()
    
    if not user or not verify_password(form_data.password, user['password_hash']):
        cur.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last_seen on login
    cur.execute("UPDATE drivers SET last_seen = NOW() WHERE id = %s", (user['id'],))
    conn.commit()
    cur.close()
    conn.close()
    
    # Emit fleet update for dashboard
    await sio.emit('fleet_update', {'driver_id': str(user['id']), 'status': 'ONLINE'})
    
    access_token = create_access_token(data={"sub": str(user['id'])})
    return {"access_token": access_token, "token_type": "bearer", "driver_id": user['id']}

@app.post("/logout")
async def logout(current_driver: str = Depends(get_current_driver)):
    """Logs out a driver by clearing their last_seen status."""
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("UPDATE drivers SET last_seen = NULL WHERE id = %s", (current_driver,))
    conn.commit()
    cur.close()
    conn.close()
    
    # Emit fleet update for dashboard
    await sio.emit('fleet_update', {'driver_id': str(current_driver), 'status': 'OFFLINE'})
    return {"message": "Logged out successfully"}

@app.post("/drivers/{identifier}/check-in")
async def driver_check_in(identifier: str):
    """Marks a driver as starting their shift. Supports Driver UUID or Vehicle Plate Number."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # 1. Try to find by Driver ID (UUID)
        try:
            uuid.UUID(identifier)
            cur.execute("UPDATE drivers SET last_seen = NOW() WHERE id = %s RETURNING id, full_name, assigned_vehicle_id", (identifier,))
        except (ValueError, errors.InvalidTextRepresentation):
            # 2. Try to find by Vehicle Plate Number
            cur.execute("""
                UPDATE drivers 
                SET last_seen = NOW() 
                FROM vehicles v 
                WHERE drivers.assigned_vehicle_id = v.id 
                AND v.plate_number = %s 
                RETURNING drivers.id, drivers.full_name, drivers.assigned_vehicle_id
            """, (identifier,))
        
        row = cur.fetchone()
        conn.commit()
        
        if not row:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail=f"Driver or Vehicle '{identifier}' not found or no driver assigned to this vehicle.")
            
        # Get vehicle details for response
        vehicle_info = None
        if row['assigned_vehicle_id']:
            cur.execute("SELECT plate_number, type FROM vehicles WHERE id = %s", (row['assigned_vehicle_id'],))
            vehicle_info = cur.fetchone()
            
        cur.close()
        conn.close()

        # Emit fleet update for dashboard
        await sio.emit('fleet_update', {'driver_id': str(row['id']), 'status': 'ONLINE'})

        return {
            "message": f"Driver {row['full_name']} checked in",
            "online": True,
            "driver_id": row['id'],
            "vehicle": vehicle_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/drivers/heartbeat")
async def driver_heartbeat(current_driver: str = Depends(get_current_driver)):
    """Keep the driver online by updating last_seen."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("UPDATE drivers SET last_seen = NOW() WHERE id = %s", (current_driver,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "alive"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/drivers/{identifier}/check-out")
async def driver_check_out(identifier: str):
    """Marks a driver as ending their shift. Supports Driver UUID or Vehicle Plate Number."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        target_driver_id = None

        # 1. Try to find by Driver ID (UUID)
        try:
            uuid.UUID(identifier)
            cur.execute("UPDATE drivers SET last_seen = NULL WHERE id = %s RETURNING id", (identifier,))
            res = cur.fetchone()
            if res:
                target_driver_id = res['id']
        except (ValueError, errors.InvalidTextRepresentation):
            # 2. Try to find by Vehicle Plate Number
            cur.execute("""
                UPDATE drivers 
                SET last_seen = NULL 
                FROM vehicles v 
                WHERE drivers.assigned_vehicle_id = v.id 
                AND v.plate_number = %s
                RETURNING drivers.id
            """, (identifier,))
            res = cur.fetchone()
            if res:
                target_driver_id = res['id']
            
        conn.commit()
        cur.close()
        conn.close()

        if target_driver_id:
            await sio.emit('fleet_update', {'driver_id': str(target_driver_id), 'status': 'OFFLINE'})

        return {"message": "Checked out successfully", "online": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/fleet")
async def get_fleet():
    """Fetches all vehicle and driver data, including assignments."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT d.id, d.full_name, d.contact_number, d.is_active, d.last_seen, v.plate_number as assigned_vehicle
            FROM drivers d
            LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
        """)
        drivers = cur.fetchall()
        
        cur.execute("""
            SELECT DISTINCT ON (v.id) v.*, d.full_name as driver_name, d.last_seen as last_activity
            FROM vehicles v
            LEFT JOIN drivers d ON d.assigned_vehicle_id = v.id
            ORDER BY v.id, d.last_seen DESC NULLS LAST
        """)
        vehicles = cur.fetchall()
        
        cur.close()
        conn.close()
        return {"vehicles": vehicles, "drivers": drivers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Vehicle CRUD ---
@app.post("/vehicles")
async def create_vehicle(plate_number: str, type: str, capacity_weight: float = 0, capacity_volume: float = 0, is_active: bool = True):
    """Creates a new vehicle."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO vehicles (plate_number, type, capacity_weight, capacity_volume, is_active) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (plate_number.upper(), type.upper(), capacity_weight, capacity_volume, is_active)
        )
        vid = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": vid, "message": "Vehicle created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, plate_number: Optional[str] = None, type: Optional[str] = None, capacity_weight: Optional[float] = None, is_active: Optional[bool] = None):
    """Updates vehicle details."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        updates, params = [], []
        if plate_number:
            updates.append("plate_number = %s")
            params.append(plate_number.upper())
        if type:
            updates.append("type = %s")
            params.append(type.upper())
        if capacity_weight is not None:
            updates.append("capacity_weight = %s")
            params.append(capacity_weight)
        if is_active is not None:
            updates.append("is_active = %s")
            params.append(is_active)
        
        if updates:
            params.append(vehicle_id)
            cur.execute(f"UPDATE vehicles SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()
        cur.close()
        conn.close()
        return {"message": "Vehicle updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str):
    """Deletes a vehicle."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM vehicles WHERE id = %s", (vehicle_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Vehicle deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Driver CRUD ---
@app.post("/drivers")
async def create_driver(full_name: str, username: str, password: str, contact_number: Optional[str] = None, assigned_vehicle_id: Optional[str] = None):
    """Creates a new driver profile."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        pwd_hash = get_password_hash(password)
        cur.execute(
            "INSERT INTO drivers (full_name, username, password_hash, contact_number, assigned_vehicle_id) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (full_name, username, pwd_hash, contact_number, assigned_vehicle_id if assigned_vehicle_id else None)
        )
        did = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": did, "message": "Driver created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/drivers/{driver_id}")
async def update_driver(driver_id: str, full_name: Optional[str] = None, contact_number: Optional[str] = None, assigned_vehicle_id: Optional[str] = "KEEP"):
    """Updates driver details and vehicle assignment."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        updates, params = [], []
        if full_name:
            updates.append("full_name = %s")
            params.append(full_name)
        if contact_number:
            updates.append("contact_number = %s")
            params.append(contact_number)
        if assigned_vehicle_id != "KEEP": 
            updates.append("assigned_vehicle_id = %s")
            params.append(assigned_vehicle_id if assigned_vehicle_id else None)
        
        if updates:
            params.append(driver_id)
            cur.execute(f"UPDATE drivers SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()
        cur.close()
        conn.close()
        return {"message": "Driver updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str):
    """Deletes a driver profile."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM drivers WHERE id = %s", (driver_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Driver deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Period CRUD ---
@app.get("/periods")
async def get_periods():
    """Fetches all defined periods."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM periods ORDER BY start_date DESC")
        periods = cur.fetchall()
        cur.close()
        conn.close()
        return periods
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/periods")
async def create_period(name: str, start_date: str, end_date: str):
    """Creates a new period (date range)."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO periods (name, start_date, end_date) VALUES (%s, %s, %s) RETURNING id",
            (name, start_date, end_date)
        )
        pid = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": pid, "message": "Period created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/periods/{period_id}")
async def update_period(period_id: str, name: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Updates an existing period."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        updates, params = [], []
        if name:
            updates.append("name = %s")
            params.append(name)
        if start_date:
            updates.append("start_date = %s")
            params.append(start_date)
        if end_date:
            updates.append("end_date = %s")
            params.append(end_date)
        
        if updates:
            params.append(period_id)
            cur.execute(f"UPDATE periods SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()
        cur.close()
        conn.close()
        return {"message": "Period updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/periods/{period_id}")
async def delete_period(period_id: str):
    """Deletes a period."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM periods WHERE id = %s", (period_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Period deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Driver Period Assignments (Rostering) ---
@app.get("/periods/{period_id}/assignments")
async def get_period_assignments(period_id: str):
    """Fetches all driver assignments for a specific period."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT driver_id FROM driver_period_assignments WHERE period_id = %s", (period_id,))
        assignments = [r['driver_id'] for r in cur.fetchall()]
        cur.close()
        conn.close()
        return assignments
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/periods/{period_id}/drivers/{driver_id}")
async def assign_driver_to_period(period_id: str, driver_id: str):
    """Assigns a driver to a specific period (Roster)."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO driver_period_assignments (period_id, driver_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (period_id, driver_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Driver assigned to period"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/periods/{period_id}/drivers/{driver_id}")
async def unassign_driver_from_period(period_id: str, driver_id: str):
    """Removes a driver from a specific period (Roster)."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM driver_period_assignments WHERE period_id = %s AND driver_id = %s",
            (period_id, driver_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Driver unassigned from period"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Warehouse/Depot Management ---
@app.get("/warehouse")
async def get_warehouses():
    """Fetches all warehouses."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM warehouse ORDER BY is_default DESC, created_at DESC")
        warehouses = cur.fetchall()
        cur.close()
        conn.close()
        return warehouses
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/warehouse/default")
async def get_default_warehouse():
    """Fetches the default warehouse."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM warehouse WHERE is_default = TRUE LIMIT 1")
        warehouse = cur.fetchone()
        cur.close()
        conn.close()
        if not warehouse:
            raise HTTPException(status_code=404, detail="No default warehouse found")
        return warehouse
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/warehouse")
async def create_warehouse(name: str, address: str, lat: float, lng: float, is_default: bool = False):
    """Creates a new warehouse."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # If setting as default, unset other defaults
        if is_default:
            cur.execute("UPDATE warehouse SET is_default = FALSE")
        
        cur.execute(
            "INSERT INTO warehouse (name, address, lat, lng, is_default) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (name, address, lat, lng, is_default)
        )
        warehouse_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": warehouse_id, "message": "Warehouse created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/warehouse/{warehouse_id}")
async def update_warehouse(warehouse_id: str, name: Optional[str] = None, address: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None, is_default: Optional[bool] = None):
    """Updates warehouse details."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = %s")
            params.append(name)
        if address is not None:
            updates.append("address = %s")
            params.append(address)
        if lat is not None:
            updates.append("lat = %s")
            params.append(lat)
        if lng is not None:
            updates.append("lng = %s")
            params.append(lng)
        if is_default is not None:
            if is_default:
                cur.execute("UPDATE warehouse SET is_default = FALSE")
            updates.append("is_default = %s")
            params.append(is_default)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        params.append(warehouse_id)
        query = f"UPDATE warehouse SET {', '.join(updates)} WHERE id = %s"
        cur.execute(query, params)
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Warehouse updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/warehouse/{warehouse_id}")
async def delete_warehouse(warehouse_id: str):
    """Deletes a warehouse."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM warehouse WHERE id = %s", (warehouse_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Warehouse deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/optimize")
@limiter.limit(CONFIG["rate_limits"]["optimize"])
async def trigger_optimization(request: Request, date: Optional[str] = None):
    """Triggers the route optimization process for a specific date (Period)."""
    logger.info(f"Triggering optimization cycle for date: {date or 'Today'}...")
    
    # 1. Run Data Model Loop to update driver parameters from history
    dm_result = run_data_model_loop()
    if dm_result["status"] == "error":
        logger.error(f"Data Model Error: {dm_result['message']}")
        raise HTTPException(status_code=500, detail=f"Data Model Error: {dm_result['message']}")
    
    # 2. Run Route Optimizer
    opt_result = run_optimization(planned_date=date)
    if opt_result["status"] == "error":
        logger.error(f"Optimizer Error: {opt_result['message']}")
        raise HTTPException(status_code=400, detail=f"Optimizer Error: {opt_result['message']}")
    
    logger.info("Optimization cycle completed successfully.")
        
    return {
        "status": "success",
        "date": date or str(datetime.now().date()),
        "data_model": dm_result,
        "optimizer": opt_result
    }

@app.get("/routes")
async def get_all_routes(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Fetches all planned routes and stops for a specific date or date range."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        if start_date and end_date:
            cur.execute("""
                SELECT r.id as route_id, r.driver_id, d.full_name, r.status, r.planned_date
                FROM routes r
                JOIN drivers d ON r.driver_id = d.id
                WHERE r.planned_date BETWEEN %s AND %s
            """, (start_date, end_date))
        else:
            target_date = date if date else str(datetime.now().date())
            cur.execute("""
                SELECT r.id as route_id, r.driver_id, d.full_name, r.status, r.planned_date
                FROM routes r
                JOIN drivers d ON r.driver_id = d.id
                WHERE r.planned_date = %s
            """, (target_date,))
            
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


@app.get("/orders")
async def get_orders(status: Optional[str] = None):
    """Fetches all orders, optionally filtered by status."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        if status:
            cur.execute("SELECT * FROM orders WHERE status = %s ORDER BY created_at DESC", (status.upper(),))
        else:
            cur.execute("SELECT * FROM orders ORDER BY created_at DESC")
        orders = cur.fetchall()
        cur.close()
        conn.close()
        return orders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/orders")
async def create_order(delivery_address: str, lat: float, lng: float, contact_person: Optional[str] = None, contact_mobile: Optional[str] = None, priority: int = 1):
    """Creates a new delivery order."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO orders (delivery_address, lat, lng, contact_person, contact_mobile, priority) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (delivery_address, lat, lng, contact_person, contact_mobile, priority)
        )
        order_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": order_id, "message": "Order created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/orders/{order_id}")
async def update_order(order_id: str, delivery_address: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None, contact_person: Optional[str] = None, contact_mobile: Optional[str] = None, status: Optional[str] = None):
    """Updates an existing order's details or status."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        updates = []
        params = []
        if delivery_address:
            updates.append("delivery_address = %s")
            params.append(delivery_address)
        if lat:
            updates.append("lat = %s")
            params.append(lat)
        if lng:
            updates.append("lng = %s")
            params.append(lng)
        if contact_person:
            updates.append("contact_person = %s")
            params.append(contact_person)
        if contact_mobile:
            updates.append("contact_mobile = %s")
            params.append(contact_mobile)
        if status:
            updates.append("status = %s")
            params.append(status.upper())
            
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        params.append(order_id)
        query = f"UPDATE orders SET {', '.join(updates)} WHERE id = %s"
        cur.execute(query, params)
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Order not found")
            
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Order updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/orders/pending")
async def delete_all_pending_orders():
    """Deletes all PENDING orders that are not assigned to any route."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # Only delete orders that are PENDING and NOT in route_stops
        cur.execute("""
            DELETE FROM orders 
            WHERE status = 'PENDING' 
            AND id NOT IN (SELECT order_id FROM route_stops WHERE order_id IS NOT NULL)
        """)
        
        count = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f"Deleted {count} pending orders")
        return {"message": f"Deleted {count} pending orders."}
    except Exception as e:
        logger.error(f"Error deleting pending orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/orders/{order_id}")
async def delete_order(order_id: str):
    """Deletes an order (only if it's PENDING and not in a route)."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # Check if order is in a route
        cur.execute("SELECT 1 FROM route_stops WHERE order_id = %s", (order_id,))
        if cur.fetchone():
             raise HTTPException(status_code=400, detail="Cannot delete order that is already assigned to a route")

        cur.execute("DELETE FROM orders WHERE id = %s", (order_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Order not found")
            
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Order deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



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


@app.delete("/routes")
async def clear_all_routes(date: Optional[str] = None):
    """Clears all routes for a specific date and resets associated orders to PENDING."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        target_date = date if date else str(datetime.now().date())
        
        # 1. Update orders to PENDING if they were assigned to this date's routes
        cur.execute("""
            UPDATE orders 
            SET status = 'PENDING' 
            WHERE id IN (
                SELECT rs.order_id 
                FROM route_stops rs
                JOIN routes r ON rs.route_id = r.id
                WHERE r.planned_date = %s
            )
        """, (target_date,))
        
        # 2. Delete the route stops and routes
        cur.execute("""
            DELETE FROM route_stops 
            WHERE route_id IN (SELECT id FROM routes WHERE planned_date = %s)
        """, (target_date,))
        cur.execute("DELETE FROM routes WHERE planned_date = %s", (target_date,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        await sio.emit('fleet_update', {'message': f'Routes for {target_date} cleared'})
        
        return {"message": f"All routes for {target_date} have been cleared and orders reset to pending."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/routes/{route_id}")
async def delete_route(route_id: str):
    """Deletes a specific route and resets associated orders to PENDING."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # 1. Check if route exists
        cur.execute("SELECT id FROM routes WHERE id = %s", (route_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Route not found")
        
        # 2. Update orders to PENDING
        cur.execute("""
            UPDATE orders 
            SET status = 'PENDING' 
            WHERE id IN (
                SELECT order_id 
                FROM route_stops 
                WHERE route_id = %s
            )
        """, (route_id,))
        
        # 3. Delete route stops and route
        cur.execute("DELETE FROM route_stops WHERE route_id = %s", (route_id,))
        cur.execute("DELETE FROM routes WHERE id = %s", (route_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        await sio.emit('fleet_update', {'message': f'Route {route_id} deleted'})
        
        return {"message": f"Route {route_id} deleted and orders reset to pending."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
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
                   rs.status as stop_status, rs.fail_reason,
                   o.delivery_address, o.lat, o.lng, o.priority, o.contact_person, o.contact_mobile
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
async def update_stop_status(stop_id: str, status: str, reason: Optional[str] = None, current_driver: str = Depends(get_current_driver)):
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

        if status.upper() == 'FAILED' and reason:
            cur.execute("UPDATE route_stops SET status = %s, fail_reason = %s WHERE id = %s", (status.upper(), reason, stop_id))
        else:
            cur.execute("UPDATE route_stops SET status = %s WHERE id = %s", (status.upper(), stop_id))
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Stop not found")
            
        conn.commit()
        cur.close()
        conn.close()
        
        await sio.emit('fleet_update', {'driver_id': current_driver, 'status': 'STOP_UPDATE'})
        return {"message": "Status updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stops/{stop_id}/pod")
async def update_stop_pod(
    stop_id: str, 
    photo: Optional[UploadFile] = File(None), 
    signature: Optional[str] = None,
    current_driver: str = Depends(get_current_driver)
):
    """Saves Proof of Delivery (Photo and/or Signature) for a stop."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        # Security: Verify ownership
        cur.execute("""
            SELECT r.driver_id FROM routes r
            JOIN route_stops rs ON rs.route_id = r.id
            WHERE rs.id = %s
        """, (stop_id,))
        owner = cur.fetchone()
        
        if not owner or str(owner['driver_id']) != current_driver:
            raise HTTPException(status_code=403, detail="Unauthorized")

        photo_url = None
        if photo:
            file_ext = photo.filename.split(".")[-1] if "." in photo.filename else "jpg"
            file_name = f"{uuid.uuid4()}.{file_ext}"
            file_path = os.path.join(UPLOAD_DIR, file_name)
            
            content = await photo.read()
            with open(file_path, "wb") as f:
                f.write(content)
            photo_url = f"/uploads/{file_name}"

        updates = []
        params = []
        if photo_url:
            updates.append("pod_photo_url = %s")
            params.append(photo_url)
        if signature:
            updates.append("pod_signature = %s")
            params.append(signature)
        
        if updates:
            params.append(stop_id)
            query = f"UPDATE route_stops SET {', '.join(updates)} WHERE id = %s"
            cur.execute(query, params)
            conn.commit()

        cur.close()
        conn.close()
        return {"message": "POD saved", "photo_url": photo_url}
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
            "UPDATE drivers SET last_known_lat = %s, last_known_lng = %s, last_seen = NOW() WHERE id = %s",
            (lat, lng, driver_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Driver not found")
        conn.commit()

        # Get driver name for the event
        cur.execute("SELECT full_name FROM drivers WHERE id = %s", (driver_id,))
        driver_row = cur.fetchone()
        full_name = driver_row['full_name'] if driver_row else f"Driver {driver_id}"
        
        cur.close()
        conn.close()

        # Emit the update via WebSocket
        await sio.emit('location_update', {
            'driver_id': driver_id,
            'full_name': full_name,
            'lat': lat,
            'lng': lng
        })

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


@app.get("/analytics/summary")
async def get_analytics_summary():
    """Fetches aggregated performance metrics for all drivers over time."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, 
                   SUM(total_orders_completed) as total_completed,
                   AVG(average_service_time) as avg_service_time,
                   AVG(efficiency_score) as avg_efficiency
            FROM performance_metrics
            GROUP BY date
            ORDER BY date ASC
            LIMIT 30
        """)
        history = cur.fetchall()
        cur.close()
        conn.close()
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analytics/drivers/{driver_id}")
async def get_driver_analytics(driver_id: str):
    """Fetches performance metrics for a specific driver."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, total_orders_completed, average_service_time, efficiency_score
            FROM performance_metrics
            WHERE driver_id = %s
            ORDER BY date ASC
            LIMIT 30
        """, (driver_id,))
        stats = cur.fetchall()
        cur.close()
        conn.close()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reports/daily")
async def get_daily_report(date: Optional[str] = None):
    """Generates a CSV report for deliveries on a specific date (Period)."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        
        target_date = date if date else str(datetime.now().date())
        
        cur.execute("""
            SELECT 
                d.full_name as driver,
                o.delivery_address,
                rs.estimated_arrival_time,
                rs.actual_arrival_time,
                rs.status,
                rs.pod_photo_url,
                rs.feedback_notes
            FROM route_stops rs
            JOIN orders o ON rs.order_id = o.id
            JOIN routes r ON rs.route_id = r.id
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.planned_date = %s
            ORDER BY d.full_name, rs.sequence_number
        """, (target_date,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Driver', 'Address', 'Estimated Arrival', 'Actual Arrival', 'Status', 'POD Photo', 'Notes'])
        
        for row in rows:
            writer.writerow([
                row['driver'],
                row['delivery_address'],
                row['estimated_arrival_time'],
                row['actual_arrival_time'],
                row['status'],
                f"http://localhost:8000{row['pod_photo_url']}" if row['pod_photo_url'] else 'N/A',
                row['feedback_notes']
            ])

        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=daily_report.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Root mount MUST come after all API routes so it doesn't swallow them
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

app_with_sio = socketio.ASGIApp(sio, app, socketio_path='ws/socket.io')

if __name__ == "__main__":
    import uvicorn
    port = CONFIG.get("api", {}).get("port", 8000)
    host = CONFIG.get("api", {}).get("host", "0.0.0.0")
    uvicorn.run("api.main:app_with_sio", host=host, port=port, reload=True)
