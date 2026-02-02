-- Database Schema for Delivery Route Optimization System

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom Types / Enums
CREATE TYPE order_status AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'FAILED');
CREATE TYPE vehicle_type AS ENUM ('BIKE', 'VAN', 'TRUCK');

-- Driver & Vehicle Management
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    type vehicle_type NOT NULL,
    capacity_weight FLOAT DEFAULT 0.0, -- in kg
    capacity_volume FLOAT DEFAULT 0.0, -- in cubic meters
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    contact_number VARCHAR(20),
    max_jobs_per_day INTEGER DEFAULT 20,
    last_known_lat FLOAT,
    last_known_lng FLOAT,
    assigned_vehicle_id UUID REFERENCES vehicles(id),
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order Management
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_order_id VARCHAR(50) UNIQUE, -- ID from the source system
    customer_id VARCHAR(50),
    delivery_address TEXT NOT NULL,
    lat FLOAT NOT NULL,
    lng FLOAT NOT NULL,
    weight FLOAT DEFAULT 0.0,
    volume FLOAT DEFAULT 0.0,
    time_window_start TIMESTAMP WITH TIME ZONE,
    time_window_end TIMESTAMP WITH TIME ZONE,
    priority INTEGER DEFAULT 1,
    status order_status DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Route Management
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES drivers(id),
    vehicle_id UUID REFERENCES vehicles(id),
    planned_date DATE NOT NULL,
    total_estimated_distance FLOAT, -- in km
    total_estimated_duration INTEGER, -- in minutes
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'PLANNED', -- PLANNED, IN_PROGRESS, COMPLETED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE route_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    sequence_number INTEGER NOT NULL,
    estimated_arrival_time TIMESTAMP WITH TIME ZONE,
    actual_arrival_time TIMESTAMP WITH TIME ZONE,
    actual_departure_time TIMESTAMP WITH TIME ZONE,
    status order_status DEFAULT 'ASSIGNED',
    feedback_notes TEXT,
    UNIQUE(route_id, sequence_number)
);

-- Real-time Feedback & Exception Handling
CREATE TABLE order_exceptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    stop_id UUID REFERENCES route_stops(id),
    exception_type VARCHAR(50), -- e.g., 'CUSTOMER_NOT_AROUND', 'DOOR_LOCKED', 'TRAFFIC'
    details TEXT,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Historical Performance (For Parameter Estimation Model)
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES drivers(id),
    date DATE NOT NULL,
    total_orders_completed INTEGER,
    average_service_time INTEGER, -- minutes spent at stop
    total_delay_minutes INTEGER,
    efficiency_score FLOAT -- custom metric for the data model
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_order_modtime
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Period Management
CREATE TABLE periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Driver to Period Assignments (Roster)
CREATE TABLE driver_period_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id UUID REFERENCES periods(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(period_id, driver_id)
);

-- Warehouse/Depot Configuration
CREATE TABLE IF NOT EXISTS warehouse (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    lat FLOAT NOT NULL,
    lng FLOAT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
