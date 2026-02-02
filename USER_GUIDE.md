# OptiRoute User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Period Management](#period-management)
3. [Fleet & Roster Management](#fleet--roster-management)
4. [Order Management](#order-management)
5. [Route Optimization](#route-optimization)
6. [Driver App](#driver-app)

---

## Getting Started

### Accessing the Dashboard
- **URL**: `http://localhost:3000`
- **Navigation**: Use the left sidebar to switch between views:
  - 📊 **Dashboard** - Map view and analytics
  - 🚛 **Fleet** - Driver roster and period management
  - 🚗 **Vehicles** - Vehicle fleet management
  - 👤 **Drivers** - Driver profiles and assignments

---

## Period Management

### What is a Period?
A **Period** is a defined date range (e.g., a week, a month, or a custom range) that allows you to plan routes and assign drivers in advance. This is perfect for weekly scheduling, holiday planning, or any multi-day operations.

### Creating a New Period

1. **Navigate to Fleet Tab**
   - Click on the 🚛 **Fleet** icon in the left sidebar

2. **Create Period**
   - Click the **"+ Create New Period"** button (top-right)
   - Fill in the form:
     - **Period Name**: e.g., "Week 5", "Holiday Rush", "Feb 3-9"
     - **Start Date**: Defaults to today (you can change it)
     - **End Date**: Defaults to 5 days from today (you can change it)
   - Click **"Add New Period"**

3. **Period Created!**
   - The modal will close
   - Your new period appears in the "Select Period" dropdown

### Editing a Period

1. Click **"+ Create New Period"** to open the Period Manager
2. Scroll to **"Existing Periods"**
3. Click the **Edit icon** (✏️) next to the period you want to modify
4. Update the details and click **"Update Period"**

### Deleting a Period

1. Click **"+ Create New Period"** to open the Period Manager
2. Scroll to **"Existing Periods"**
3. Click the **Trash icon** (🗑️) next to the period
4. Confirm the deletion
   - ⚠️ **Note**: This will also remove all driver assignments for this period

---

## Fleet & Roster Management

### Understanding the Roster System

When you select a period, the Fleet view splits into two sections:
- **✅ Rostered Drivers** - Drivers assigned to work this period
- **⚪ Available Pool** - Drivers not yet assigned to this period

### Assigning Drivers to a Period

1. **Select Your Period**
   - In the Fleet tab, use the **"Select Period"** dropdown
   - Choose the period you want to roster (e.g., "Week 5")

2. **View Available Drivers**
   - Scroll to the **"Available Pool (Not in Roster)"** section
   - You'll see all active drivers with in-service vehicles

3. **Assign Drivers**
   - Click the **"Assign"** button on any driver card
   - The driver immediately moves to the **"Rostered"** section
   - A green **"ROSTERED"** badge appears on their card

4. **Remove Drivers** (if needed)
   - In the **"Rostered"** section, click **"Remove"** on any driver
   - They move back to the Available Pool

### Managing Vehicle Assignments

**Option 1 - From Drivers Tab:**
1. Go to the **Drivers** tab
2. Click on a driver card
3. In the Driver Editor, select a vehicle from the dropdown
4. Click **"Save Changes"**

**Option 2 - Quick Edit from Fleet:**
1. In the Fleet tab, click on any driver card
2. The Driver Editor opens
3. Change the vehicle assignment
4. Click **"Save Changes"**

### Vehicle Status (In Service / Out of Service)

1. Go to the **Vehicles** tab
2. Click on a vehicle card
3. Toggle the **"Vehicle is In Service"** checkbox
4. Click **"Save Changes"**

**Important**: Only drivers with **In-Service** vehicles appear in the Fleet roster.

---

## Order Management

### Adding a New Order

1. **From Dashboard View**
   - Click the **"+ Order"** button in the top header

2. **Fill in Order Details**
   - **Delivery Address**: Customer's address
   - **Contact Person**: Customer name
   - **Contact Mobile**: Phone number
   - **Priority**: NORMAL, HIGH, or URGENT
   - **Weight (kg)**: Package weight
   - **Volume (m³)**: Package volume

3. **Save Order**
   - Click **"Create Order"**
   - The order appears in the "Pending Orders" panel

### Editing an Order

1. Click on an order card in the "Pending Orders" panel
2. Or click the **Edit icon** (✏️) on an order card
3. Modify the details
4. Click **"Save Changes"**

### Deleting Orders

**Delete Single Order:**
- Click the **Trash icon** (🗑️) on an order card

**Delete All Pending Orders:**
1. In the "Pending Orders" panel header
2. Click **"Delete All Pending"**
3. Confirm the action

---

## Route Optimization

### Running Optimization for a Period

1. **Select Your Period** (or use Daily View)
   - Use the period selector in the top header
   - Or use the Fleet tab's period dropdown

2. **Ensure You Have:**
   - ✅ Pending orders in the system
   - ✅ Active drivers (with in-service vehicles)
   - ✅ If using a period: Drivers rostered to that period

3. **Run Optimizer**
   - Click the **⚡ Run Optimizer** button in the top header
   - Wait for the optimization to complete (you'll see activity logs)

4. **View Results**
   - Routes appear on the map
   - Each driver's route is color-coded
   - Click on a driver in the sidebar to see their schedule

### How Period-Based Optimization Works

- **Daily View**: Uses all active drivers with in-service vehicles
- **Period View**: Uses **only** the drivers rostered to that period
- **Date Selection**: Routes are planned for the period's start date

### Clearing Routes

1. Click the **"Clear Routes"** button in the top header
2. Confirm the action
3. All routes for the selected date/period are removed

---

## Driver App

### Accessing the Driver App
- **URL**: `http://localhost:3000/driver`
- **Login**: Use driver credentials (username/password)

### Driver App Features

1. **View Assigned Route**
   - See all stops for the day
   - View customer details and addresses

2. **Update Delivery Status**
   - Mark stops as:
     - ✅ **Delivered**
     - ❌ **Failed**
     - ⏸️ **Pending**

3. **Real-time Location**
   - The app sends location updates to the dashboard
   - Managers can see driver locations on the map

4. **Shift Management**
   - **Start Shift**: Begin your workday
   - **End Shift**: Complete your workday

---

## Best Practices

### Weekly Planning Workflow

1. **Monday Morning**:
   - Create a period for the week (e.g., "Week 5: Feb 3-9")
   - Assign drivers to the roster
   - Import/create orders for the week

2. **Daily Operations**:
   - Run optimization each morning for that day
   - Monitor driver progress on the map
   - Handle exceptions (failed deliveries, new orders)

3. **End of Week**:
   - Download reports for analysis
   - Review driver performance
   - Plan for next week

### Tips for Better Routes

- ✅ **Accurate Addresses**: Ensure delivery addresses are complete
- ✅ **Realistic Capacities**: Set vehicle capacities accurately
- ✅ **Priority Orders**: Use HIGH/URGENT for time-sensitive deliveries
- ✅ **Active Vehicles**: Keep vehicle status updated (In Service / Out of Service)
- ✅ **Roster Planning**: Assign drivers to periods in advance

---

## Troubleshooting

### "No drivers found for optimization"
- **Check**: Do you have active drivers?
- **Check**: Are their vehicles marked as "In Service"?
- **Check**: If using a period, are drivers rostered to it?

### "No pending orders found"
- **Solution**: Add orders via the "+ Order" button
- **Check**: Orders must have status "PENDING"

### Routes not appearing on map
- **Solution**: Clear browser cache and refresh
- **Check**: Ensure optimization completed successfully (check activity log)

### Driver not showing in roster
- **Check**: Is the driver's vehicle "In Service"?
- **Solution**: Go to Vehicles tab and enable the vehicle

---

## Keyboard Shortcuts

- **Esc**: Close any open modal/editor
- **F12**: Open browser console (for debugging)

---

## Support

For technical issues or feature requests, check the console logs (F12) and contact your system administrator.

**Database Migration**: If you encounter "relation does not exist" errors, run:
```bash
uv run python -m scripts.migrate_periods
```

---

**Version**: 1.0  
**Last Updated**: February 2, 2026
