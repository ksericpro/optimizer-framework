# 🚚 OptiRoute User Guide

Welcome to the **OptiRoute** Delivery Optimization System. This guide provides instructions on how to manage orders and generate delivery routes for your drivers.

---

## 🏗️ Getting Started

- **Management Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Driver App**: [http://localhost:3000/driver](http://localhost:3000/driver)

### 3. Deleting Orders
If you need to remove an order:
1. In the **Map & Orders** view, find the **Pending** tab in the info panel.
2. Locate the order you wish to delete.
3. Click the **Trash** icon (🗑️) on the right side of the order card.
4. Confirm the deletion in the popup.
*Note: Orders assigned to a route cannot be deleted until the route is cleared.*

**Bulk Delete**: 
- To delete **ALL** pending orders at once, click the **"Delete All Pending"** button at the top of the Pending list.

---

### 4. Clearing All Routes
If you want to start fresh or resolve assignment issues:
1. Access the **Management Dashboard**.
2. Click the **Clear Routes** button (Refresh icon 🔄, highlighted in red) in the top action bar.
3. Confirm the action.
4. All current assignments for today will be deleted, and all orders will return to the **Pending** state.

---

## 👨‍✈️ Managing Driver Status

Drivers can be "Online" or "Offline" depending on their activity or admin intervention.

### Administrative Shift Management (Admin Dashboard)
1. Go to the **Fleet (Assignments)** tab (🚚 icon).
2. Locate the driver's card.
3. Use the toggle buttons on the card:
   - **Start Shift**: Immediately marks the driver as **ONLINE**.
   - **End Shift**: Immediately marks the driver as **OFFLINE**.

### Automatic Status Management
- **Going ONLINE**: A driver is automatically marked as **ONLINE** the moment they log into the **Driver App**.
- **Going OFFLINE**: A driver is automatically marked as **OFFLINE** when they click the **Logout** icon in the Driver App header.
- **Inactivity**: If a driver closes their browser without logging out, they may still appear online until the auto-refresh period (5 minutes) expires or an admin manually ends their shift.

---

## 📝 How to Generate Deliveries for Drivers

If a driver (e.g., John) currently has no deliveries, follow these steps to populate their schedule:

### 1. Create New Orders
You need "Pending" orders in the system for the optimizer to assign.
1. Access the **Management Dashboard**.
2. Click the **Plus (+)** icon in the top header to open the Order Editor.
3. Fill in the required details:
   - **Delivery Address**: Where the package is going.
   - **Recipient Name**: The person receiving the delivery.
   - **Mobile Number**: Contact info for the driver.
4. Click **Create Order**.
5. *Tip: Create at least 3-5 orders to see a full route.*

### 2. Run the Optimization
Assignments are not automatic; you must trigger the AI optimization cycle.
1. Locate the **Optimize** button (Zap/Lightning icon ⚡) in the top action bar of the dashboard.
2. Click the button and wait for the "Optimization complete" notification.
3. The AI will now calculate the most efficient route and assign the stops to available drivers with vehicles.

### 3. Verify in the Driver App
1. Open the **Driver App**.
2. Log in as a driver (e.g., **Username**: `john`, **Password**: `password123`).
3. The dashboard will now display the assigned stops in the correct delivery sequence.

---

## 🛠️ Troubleshooting

### Driver has no orders after optimization?
- **Active Status**: Ensure the driver is toggled to **Active** in the Fleet management section.
- **Vehicle Assignment**: Drivers must have an assigned vehicle with capacity (Weight/Volume) to receive routes.
- **Location**: If the optimizer cannot find a valid path to an address, that order will remain "Pending."

### App looks broken or uncentered?
- Ensure you are running the latest version of the frontend.
- If styles appear missing, refresh the page to reload the inline-styled components.

---

## 📱 Driver App Features
- **Real-time Status**: Drivers appear **ONLINE** on the dashboard instantly after logging in. The sidebar and fleet map update in real-time via WebSockets without needing a page refresh.
- **Proof of Delivery (POD)**:
  - **Signature**: Tap the signature pad to sign.
  - **Photo**: Click the package icon to upload a photo of the delivered item.
- **Completion**: Once a delivery is confirmed, it is marked as "Delivered" and moved to the bottom of the list.

---
*© 2026 OptiRoute Logistics Framework*
