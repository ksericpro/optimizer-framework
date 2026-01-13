# Antigravity Delivery Optimizer: Feature Verification Guide

This guide provides step-by-step instructions to verify every major feature of the platform.

---

## 1. Environment & Stack Setup
**Goal**: Verify that all services (API, DB, OSRM, Nginx, Frontend) are running in harmony.

1.  **Start the Stack**:
    ```powershell
    docker-compose up --build -d
    ```
2.  **Update Schema (POD Support)**:
    ```powershell
    uv run python -m scripts.update_db_pod
    ```
3.  **Seed the Fleet (10 Drivers & 50 Singapore Orders)**:
    ```powershell
    uv run python -m scripts.seed_data
    uv run python -m scripts.setup_auth
    ```
3. Run the API server
    
    ```
    uv run uvicorn api.main:app_with_sio --reload
    ```

5.  **Verify Accessibility**:
    - Dashboard: Open `http://localhost:8000/dashboard/` in your browser. (Map should center on Singapore).
    - Driver App: Open `http://localhost:8000/driver` in your browser.

    Usernames: john, jane, or bob
    Password: password123

    - API Health: Check `http://localhost:8000/api/` (should return "Delivery Optimizer API is running").

## Dashboard
- Run the Optimizer: Click the "⚡ Run Optimizer" button in the top header. You should see the grey "Pending" dots turn into colored routes once the optimization finishes.


6. **Simulate Drivers**: Open a new terminal and run:
```
- uv run python -m scripts.simulate_drivers
```
- the script simulates Real-time GPS movement for all drivers currently assigned to routes.

- Specifically, it performs the following steps:

- Authentication: It automatically logs in as each driver using their credentials (defaulting to password123) to obtain JWT security tokens.

- Route Loading: It fetches today's optimized routes from the database for every driver.
Path Interpolation: It calculates a path starting from a "Depot" point (central Singapore) and moving smoothly through each assigned stop in the correct sequence.
Location Pulse (The Event): Every ~0.2 seconds, it sends a PATCH request to the API updating the driver's coordinates.

- WebSocket Broadcast: The API catches these updates and broadcasts a location_update event via Socket.io.
Dashboard Reaction: Your dashboard (on port 8000) listens for these events and moves the truck icons (🚚) on the map in real-time without you needing to refresh the page.

---
## Fleet Management (Check-In / Out)
1. **View Assignments**: Go to the **Fleet** view. You will now see that each driver has a **Tied Vehicle** assigned to them.
2. **Clock In**: Click the **"Check In"** button for a driver. The status turns **ONLINE (Green)** and the dashboard acknowledges their assigned vehicle.
3. **Clock Out**: Click **"Check Out"** to end the shift. The status turns **OFFLINE (Grey)**.

**APIs**:
*   `POST /drivers/<ID>/check-in`
*   `POST /drivers/<ID>/check-out`

curl -XPOST http://localhost:8000/drivers/SGP-102Z/check-in

{"message":"Driver Charlie Lim checked in","online":true,"driver_id":"4075bff8-48aa-4a66-9988-2cecc15c79a5","vehicle":{"plate_number":"SGP-102Z","type":"BIKE"}}

curl -XPOST http://localhost:8000/drivers/SGP-102Z/check-out
{"message":"Checked out successfully","online":false}


## 2. Order Management (CRUD & Map)
**Goal**: Verify that you can create and manage orders via the UI.

1.  **Add Order**: Click **"+ Add Order"** on the dashboard. Click anywhere on the map. Enter an address and save.
2.  **Verify Persistence**: Refresh the page; the new order marker should remain on the map as a grey (Pending) dot.
3.  **Edit/Delete**: Click an existing marker, change the address, or delete it using the panel.

---

## 3. Intelligent Optimization (Advanced Constraints)
**Goal**: Verify the OR-Tools engine respects vehicle capacities and driver breaks.

1.  **Seed Drivers/Vehicles**: Ensure drivers are active in the database.
2.  **Generate Routes**:
    - **Option A (UI)**: Click the **"⚡ Run Optimizer"** button on the dashboard header.
    - **Option B (Manual)**: Run the script directly: `python -m scripts.optimizer_prototype`
3.  **Verify Route Count & Assignment**:
    - **Visual**: Each colored polyline on the map represents one route (up to 10 for the 10 drivers).
    - **Schedule View**: Click a driver card in the sidebar. If the **"Schedule"** tab populates with list of stops, the route was successfully generated for that driver.
4.  **Verify Constraints**:
    - Observe that heavy orders (Weight > Vehicle Capacity) are split between multiple vehicles.
    - Check the timeline for a "Break" window at 12:00 PM (the optimizer calculates travel times *around* this idle period).

---

## 4. Driver Workflow & Proof of Delivery (POD)
**Goal**: Verify the "last-mile" completion process.

1.  **Login**: Go to `http://localhost/driver`. Login with `john` or `jane` or `alice`, etc. (username is the driver's first name in lowercase, password is `password123`).
2.  **Delivery**: 
    - You will see a list of assigned stops for "John Doe".
    - Click **"Mark as Delivered"** on a stop.
3.  **Capture POD**:
    - **Photo**: Click "📸 Take Photo" (simulated via file upload).
    - **Signature**: Draw a signature on the white canvas.
    - Click **"Complete Delivery"**.
4.  **Verification**: The stop should now show as green ("✓ DELIVERED") in the driver app and on the management dashboard map.

---

## 5. Real-time Tracking & Smart Alerts
**Goal**: Verify the WebSocket connection and risk monitoring.

1.  **Simulate Movement**:
    ```powershell
    python -m scripts.simulate_drivers
    ```
2.  **Live Tracking**: Observe the truck icons (🚚) moving on the dashboard map in real-time.
3.  **Simulate Late Risk**:
    - In the database (or via script), set a pending stop's `estimated_arrival_time` to be 5 minutes from now.
    - Wait up to 60 seconds.
    - A **red alert toast** should slide in from the top-right alert container on the dashboard.

---

## 6. Analytics & Auditing
**Goal**: Verify data visualization and reporting.

1.  **Seed History**:
    ```powershell
    python -m scripts.seed_performance
    ```
2.  **Charts**: Click **"Analytics"** in the sidebar. Verify that the line charts for volume, service time, and efficiency are populated.
3.  **POD Audit**:
    - Go back to the Dashboard "Schedule" tab for the driver who completed the earlier delivery.
    - Click **"View Photo"** and **"View Signature"** in the timeline item.
4.  **CSV Report**: Click **"📥 Download Report"** in the header. Open the CSV and verify it contains all stop details and links to the POD photos.

## 7. Data Model & Parameter Learning
**Goal**: Verify the automated nightly learning cycle and the manual parameter updates.

1.  **Check Scheduled Task**: 
    - Upon starting the API (via `docker-compose logs -f optimizer_api`), you should see a log entry: `Data Model scheduled to run in XX.XX hours.` confirming the nightly task is queued.
2.  **Manual Trigger**:
    - You can force the "Learning Phase" to run immediately without waiting for midnight using the admin endpoint:
    ```powershell
    Invoke-RestMethod -Method Post -Uri "http://localhost/api/admin/run-data-model"
    ```
3.  **Verify Parameter Update**:
    - Check the `drivers` table or the system logs. If historical performance was seeded in Step 6, the manual trigger will update the `max_jobs_per_day` parameter for drivers based on their efficiency scores.

---
