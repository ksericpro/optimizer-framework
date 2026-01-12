from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile
from fastapi.responses import StreamingResponse
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
import os
import uuid
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
    allow_origins=["http://localhost:8480"],  # Explicitly allow the frontend dev server
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
async def create_order(delivery_address: str, lat: float, lng: float, priority: int = 1):
    """Creates a new delivery order."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO orders (delivery_address, lat, lng, priority) VALUES (%s, %s, %s, %s) RETURNING id",
            (delivery_address, lat, lng, priority)
        )
        order_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": order_id, "message": "Order created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/orders/{order_id}")
async def update_order(order_id: str, delivery_address: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None, status: Optional[str] = None):
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
            "UPDATE drivers SET last_known_lat = %s, last_known_lng = %s WHERE id = %s",
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
async def get_daily_report():
    """Generates a CSV report for today's deliveries."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                d.full_name as driver,
                rs.delivery_address,
                rs.estimated_arrival_time,
                rs.actual_arrival_time,
                rs.status,
                rs.pod_photo_url,
                rs.feedback_notes
            FROM route_stops rs
            JOIN routes r ON rs.route_id = r.id
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.planned_date = CURRENT_DATE
            ORDER BY d.full_name, rs.sequence_number
        """)
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

app_with_sio = socketio.ASGIApp(sio, app, socketio_path='ws/socket.io')
