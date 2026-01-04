# Database Design

Database Design: We can generate the specific SQL schema for the PostgreSQL tables mentioned (Orders, Drivers, Routes).
Optimization Prototype: We can write a "Hello World" script using OR-Tools that takes a small set of dummy orders and creates a basic route.
API Structure: We can define the FastAPI endpoints the mobile app will use to fetch routes and post updates.


# Key Features of the Schema:

Core Entities:
drivers: Stores driver info and the critical max_jobs_per_day parameter which your Data Model will update.
vehicles: Tracks capacity limits (weight/volume) which the optimizer needs to respect.
orders: Includes delivery windows, location (lat/lng), and priority.
Optimization Results:
routes: Represents a single driver's plan for a specific day.
route_stops: Defines the sequence of deliveries. This is where the optimizer writes its output and the Mobile App records actual_arrival_time.
The Feedback Loop:
order_exceptions: Specifically handles scenarios you mentioned (customer not around, door locked).
performance_metrics: This table serves as the "Learning Dataset" for your Data Model. It aggregates how drivers actually performed compared to the plan.
Data Model Integration
To satisfy your requirement about the daily Data Model run:

Every night, your Data Model will query the performance_metrics table.
It will calculate a new max_jobs_per_day value.
It will UPDATE drivers SET max_jobs_per_day = X ... based on those insights.

# The Daily Input Flow (Morning)
Step A: Run 
data_model_loop.py
It looks at how John and Jane actually performed yesterday and last week.
It updates the drivers table in the database.
Result: The input parameters (how many jobs each driver can handle) are now ready.
Step B: Run 
optimizer_prototype.py
 (via POST /optimize)
It reads the newly updated parameters from the drivers table.
It combines these with the daily orders.
Result: It generates the optimized routes that respect each driver's specific capability.

# Progress Tracker
- [x] Database Schema (PostgreSQL/Docker)
- [x] Sample Data Seed (50 NYC Orders)
- [x] Multi-Vehicle Optimizer (VRPTW with Service Times)
- [x] Route Persistence (Saving to DB)
- [x] FastAPI Integration (API Endpoints)
- [x] Data Model Loop (Historical Performance Analysis)
- [x] Structured Logging (Rotating logs with colorlog)
- [x] CORS Middleware (Enabled for Frontend/Mobile App)



# Next Steps
1.  **Real Distance Matrix:** Replace Euclidean math with actual road distances (OSRM or Google Maps).
2.  **Order Persistence:** Currently we only fetch `PENDING` orders, but we should make sure the system handles order updates efficiently.
3.  **Authentication:** Add basic authentication to the API to secure driver/order data.



