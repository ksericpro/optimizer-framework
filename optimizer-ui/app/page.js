'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { io } from 'socket.io-client';
import { Download, Plus, Zap, AlertTriangle, X, Info, Minus, Maximize2, GripHorizontal, Edit, Trash2 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#0a0b14] flex items-center justify-center"><span className="text-[#00d2ff]">Loading Map...</span></div>
});

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export default function Dashboard() {
  const [activeView, setActiveView] = useState('dashboard');
  const [routes, setRoutes] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverLocations, setDriverLocations] = useState({});
  const [activityFeed, setActivityFeed] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState('activity');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderEditor, setShowOrderEditor] = useState(false);
  const [focusedLocation, setFocusedLocation] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [showVehicleDeleteConfirm, setShowVehicleDeleteConfirm] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState(null);
  const [showDriverDeleteConfirm, setShowDriverDeleteConfirm] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);

  // const [toasts, setToasts] = useState([]); // Removed per user request
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [vehicles, setVehicles] = useState([]);
  const [showVehicleEditor, setShowVehicleEditor] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [showDriverEditor, setShowDriverEditor] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPanelPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handlePanelMouseDown = (e) => {
    // Only drag if clicking the header/handle
    if (e.target.closest('.panel-controls') || e.target.closest('.tab-btn')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - panelPosition.x,
      y: e.clientY - panelPosition.y
    };
  };

  // Toast logic removed per user request
  /*
  const showToast = useCallback((msg) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);
  */

  const addActivity = useCallback((user, msg, type = 'SYSTEM') => {
    setActivityFeed(prev => [{
      user,
      msg,
      type,
      time: new Date().toLocaleTimeString()
    }, ...prev].slice(0, 50));

    // Alert toast removed per user request
  }, []);

  const fetchData = useCallback(async () => {
    console.log('🔄 Fetching data from:', API_BASE);
    try {
      const routesRes = await fetch(`${API_BASE}/routes/today`);
      if (routesRes.ok) {
        const routesData = await routesRes.json();
        console.log('📍 Routes fetched:', routesData.length, 'routes', routesData);
        setRoutes(routesData);
      } else {
        console.warn('⚠️ Routes fetch failed:', routesRes.status);
      }

      const ordersRes = await fetch(`${API_BASE}/orders?status=PENDING`);
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        console.log('📦 Pending orders fetched:', ordersData.length, 'orders', ordersData);
        setPendingOrders(ordersData);
      } else {
        console.warn('⚠️ Orders fetch failed:', ordersRes.status);
      }

      const fleetRes = await fetch(`${API_BASE}/fleet`);
      if (fleetRes.ok) {
        const data = await fleetRes.json();
        console.log('🚚 Fleet fetched:', data);
        setDrivers(data.drivers || []);
        setVehicles(data.vehicles || []);

        const locs = {};
        (data.drivers || []).forEach(d => {
          if (d.last_known_lat && d.last_known_lng) {
            locs[d.id] = { driver_id: d.id, lat: d.last_known_lat, lng: d.last_known_lng, full_name: d.full_name };
          }
        });
        setDriverLocations(locs);
      } else {
        console.warn('⚠️ Fleet fetch failed:', fleetRes.status);
      }

      const analyticsRes = await fetch(`${API_BASE}/analytics/summary`);
      if (analyticsRes.ok) {
        const analytics = await analyticsRes.json();
        setAnalyticsData(analytics);
      }
    } catch (err) {
      console.error('❌ API Error:', err);
      addActivity('ERROR', 'Failed to connect to API.', 'ALERT');
    }
  }, [addActivity]);

  useEffect(() => {
    fetchData();
    addActivity('SYSTEM', 'Dashboard connected to background services.');

    const interval = setInterval(fetchData, 60000);

    const socket = io(API_BASE, {
      path: '/ws/socket.io'
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      addActivity('SYSTEM', 'Real-time tracking activated.');
    });

    socket.on('location_update', (data) => {
      setDriverLocations(prev => ({
        ...prev,
        [data.driver_id]: data
      }));
    });

    socket.on('alert', (data) => {
      addActivity('ALERT', data.message, 'ALERT');
    });

    socket.on('fleet_update', () => {
      fetchData();
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [fetchData, addActivity]);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    addActivity('USER', 'Starting optimization cycle...');
    try {
      const res = await fetch(`${API_BASE}/optimize`, { method: 'POST' });
      const data = await res.json();
      addActivity('AI', `Optimization complete. Assigned ${data.optimizer?.orders_assigned || 0} orders.`);
      await fetchData();
    } catch (err) {
      addActivity('ERROR', 'Optimization failed.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/reports/daily`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily_report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      addActivity('SYSTEM', 'Report downloaded successfully.');
    } catch (err) {
      addActivity('ERROR', 'Failed to download report.');
    }
  };

  const showDriverSchedule = (driver) => {
    setSelectedDriver(driver);
    setActiveInfoTab('schedule');
  };

  const openOrderEditor = (order) => {
    setSelectedOrder(order);
    setShowOrderEditor(true);
  };

  const openVehicleEditor = (vehicle) => {
    setEditingVehicle(vehicle);
    setShowVehicleEditor(true);
  };

  const openDriverEditor = (driver) => {
    setEditingDriver(driver);
    setShowDriverEditor(true);
  };

  const handleSaveOrder = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const orderData = Object.fromEntries(formData.entries());

    // Mock Geocoding (Singapore bounds)
    if (!orderData.lat || !orderData.lng) {
      orderData.lat = 1.29 + Math.random() * 0.15; // 1.29 to 1.44
      orderData.lng = 103.6 + Math.random() * 0.4; // 103.6 to 104.0
    }

    // Fix Priority (Backend expects int)
    const priorityMap = { 'NORMAL': 1, 'HIGH': 2, 'URGENT': 3 };
    orderData.priority = priorityMap[orderData.priority] || 1;

    try {
      const url = selectedOrder ? `${API_BASE}/orders/${selectedOrder.id}` : `${API_BASE}/orders`;
      const method = selectedOrder ? 'PATCH' : 'POST';

      // Backend expects Query Parameters for these endpoints
      const params = new URLSearchParams();
      if (orderData.delivery_address) params.append('delivery_address', orderData.delivery_address);
      if (orderData.lat) params.append('lat', orderData.lat);
      if (orderData.lng) params.append('lng', orderData.lng);
      if (orderData.priority) params.append('priority', orderData.priority);
      if (orderData.contact_person) params.append('contact_person', orderData.contact_person);
      if (orderData.contact_mobile) params.append('contact_mobile', orderData.contact_mobile);
      if (selectedOrder && orderData.status) params.append('status', orderData.status);

      const fetchUrl = `${url}?${params.toString()}`;

      const res = await fetch(fetchUrl, {
        method,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to save order');
      }

      addActivity('SYSTEM', `Order ${selectedOrder ? 'updated' : 'created'} successfully.`);
      setShowOrderEditor(false);
      fetchData();
    } catch (err) {
      console.error(err);
      addActivity('ERROR', `Failed to save order: ${err.message}`);
    }
  };

  const handleDeleteOrder = (order = selectedOrder) => {
    if (!order) return;
    setOrderToDelete(order);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await fetch(`${API_BASE}/orders/${orderToDelete.id}`, { method: 'DELETE' });
      addActivity('SYSTEM', 'Order deleted.');
      if (selectedOrder?.id === orderToDelete.id) {
        setShowOrderEditor(false);
      }
      setShowDeleteConfirm(false);
      setOrderToDelete(null);
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to delete order.');
    }
  };

  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const vehicleData = Object.fromEntries(formData.entries());

    try {
      const url = editingVehicle ? `${API_BASE}/vehicles/${editingVehicle.id}` : `${API_BASE}/vehicles`;
      const method = editingVehicle ? 'PATCH' : 'POST';

      // Backend expects Query Parameters
      const params = new URLSearchParams();
      if (vehicleData.plate_number) params.append('plate_number', vehicleData.plate_number);
      if (vehicleData.type) params.append('type', vehicleData.type);
      if (vehicleData.capacity_weight) params.append('capacity_weight', vehicleData.capacity_weight);

      const fetchUrl = `${url}?${params.toString()}`;

      const res = await fetch(fetchUrl, {
        method,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed to save vehicle');

      addActivity('SYSTEM', `Vehicle ${editingVehicle ? 'updated' : 'created'} successfully.`);
      setShowVehicleEditor(false);
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to save vehicle.');
    }
  };

  const handleDeleteVehicle = () => {
    if (!editingVehicle) return;
    setVehicleToDelete(editingVehicle);
    setShowVehicleDeleteConfirm(true);
  };

  const confirmDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    try {
      await fetch(`${API_BASE}/vehicles/${vehicleToDelete.id}`, { method: 'DELETE' });
      addActivity('SYSTEM', 'Vehicle deleted.');
      setShowVehicleEditor(false);
      setShowVehicleDeleteConfirm(false);
      setVehicleToDelete(null);
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to delete vehicle.');
    }
  };

  const handleSaveDriver = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const driverData = Object.fromEntries(formData.entries());

    try {
      const url = editingDriver ? `${API_BASE}/drivers/${editingDriver.id}` : `${API_BASE}/drivers`;
      const method = editingDriver ? 'PATCH' : 'POST';

      // Backend expects Query Parameters
      const params = new URLSearchParams();
      if (driverData.full_name) params.append('full_name', driverData.full_name);
      if (driverData.username) params.append('username', driverData.username);
      if (driverData.password) params.append('password', driverData.password);
      if (driverData.contact_number) params.append('contact_number', driverData.contact_number);
      if (driverData.assigned_vehicle) params.append('assigned_vehicle_id', driverData.assigned_vehicle); // Note: UI uses assigned_vehicle, backend expects assigned_vehicle_id

      const fetchUrl = `${url}?${params.toString()}`;

      const res = await fetch(fetchUrl, {
        method,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed to save driver');

      addActivity('SYSTEM', `Driver ${editingDriver ? 'updated' : 'created'} successfully.`);
      setShowDriverEditor(false);
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to save driver.');
    }
  };

  const handleDeleteDriver = () => {
    if (!editingDriver) return;
    setDriverToDelete(editingDriver);
    setShowDriverDeleteConfirm(true);
  };

  const confirmDeleteDriver = async () => {
    if (!driverToDelete) return;
    try {
      await fetch(`${API_BASE}/drivers/${driverToDelete.id}`, { method: 'DELETE' });
      addActivity('SYSTEM', 'Driver deleted.');
      setShowDriverEditor(false);
      setShowDriverDeleteConfirm(false);
      setDriverToDelete(null);
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to delete driver.');
    }
  };

  const checkIn = async (driverId) => {
    try {
      await fetch(`${API_BASE}/drivers/${driverId}/check-in`, { method: 'POST' });
      addActivity('SYSTEM', 'Driver checked in.');
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to check in driver.');
    }
  };

  const checkOut = async (driverId) => {
    try {
      await fetch(`${API_BASE}/drivers/${driverId}/check-out`, { method: 'POST' });
      addActivity('SYSTEM', 'Driver checked out.');
      fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to check out driver.');
    }
  };

  const totalDelivered = routes.reduce((acc, r) => acc + (r.stops?.filter(s => s.stop_status === 'DELIVERED').length || 0), 0);
  const totalStops = routes.reduce((acc, r) => acc + (r.stops?.length || 0), 0);
  const efficiency = totalStops > 0 ? Math.round((totalDelivered / totalStops) * 100) : 0;

  const driverSchedule = selectedDriver ? routes.find(r => r.driver_id === selectedDriver.id)?.stops || [] : [];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar glass">
        <div className="logo">
          <div className="logo-icon"></div>
          <h1>Optimizer</h1>
        </div>

        <nav className="main-nav">
          <NavItem icon="📍" label="Map & Orders" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
          <NavItem icon="🚚" label="Fleet (Assignments)" active={activeView === 'fleet'} onClick={() => setActiveView('fleet')} />
          <NavItem icon="🚛" label="Vehicles" active={activeView === 'vehicles'} onClick={() => setActiveView('vehicles')} />
          <NavItem icon="👤" label="Drivers" active={activeView === 'drivers'} onClick={() => setActiveView('drivers')} />
          <NavItem icon="📈" label="Analytics" active={activeView === 'analytics'} onClick={() => setActiveView('analytics')} />
        </nav>

        <div className="driver-stats-container">
          <h3>Active Drivers</h3>
          <div className="scrollable" style={{ flex: 1 }}>
            {drivers.map(driver => (
              <div
                key={driver.id}
                onClick={() => showDriverSchedule(driver)}
                className={`driver-mini-card ${selectedDriver?.id === driver.id ? 'active' : ''}`}
              >
                <div className="driver-header">
                  <div className="status-dot"></div>
                  <span>{driver.full_name}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Live Tracking Active</div>
              </div>
            ))}
          </div>
        </div>
      </aside >

      {/* Main Content */}
      < main className="main-content" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', paddingTop: '0' }
      }>
        {activeView === 'dashboard' && (
          <>
            {/* Map Section */}
            <section className="map-section">
              <Map
                routes={routes}
                pendingOrders={pendingOrders}
                driverLocations={driverLocations}
                onOrderClick={openOrderEditor}
                focusedLocation={focusedLocation}
              />
              <div className="map-overlay">
                <div className="map-legend glass">
                  <div className="legend-item"><span className="dot pending"></span> Pending</div>
                  <div className="legend-item"><span className="dot assigned"></span> Assigned</div>
                  <div className="legend-item"><span className="dot delivered"></span> Delivered</div>
                </div>
              </div>
            </section>

            {/* Top Header */}
            <header className="top-header glass">
              <div className="stats-bar">
                <Stat label="Today's Volume" value={totalStops} />
                <Stat label="Efficiency" value={`${efficiency}%`} />
                <Stat label="Active Routes" value={routes.length} />
              </div>

              <div className="actions">
                <button onClick={handleDownloadReport} className="btn btn-secondary">
                  <Download size={16} /> Download Report
                </button>
                <button onClick={() => openOrderEditor(null)} className="btn btn-secondary">
                  <Plus size={16} /> Add Order
                </button>
                <button onClick={handleOptimize} disabled={isOptimizing} className="btn btn-primary">
                  <Zap size={16} /> {isOptimizing ? 'Optimizing...' : 'Run Optimizer'}
                </button>
              </div>
            </header>

            {/* Info Panel */}
            <section
              className={`info-panel glass ${panelMinimized ? 'minimized' : ''}`}
              style={{ transform: `translate(${panelPosition.x}px, ${panelPosition.y}px)` }}
            >
              <div className="panel-header" onMouseDown={handlePanelMouseDown}>
                <div className="drag-handle">
                  <GripHorizontal size={16} color="var(--text-dim)" />
                </div>
                <div className="panel-controls">
                  <button onClick={() => setPanelMinimized(!panelMinimized)} className="icon-btn">
                    {panelMinimized ? <Maximize2 size={14} /> : <Minus size={14} />}
                  </button>
                </div>
              </div>

              {!panelMinimized && (
                <div className="tabs">
                  <TabButton label="Activity" active={activeInfoTab === 'activity'} onClick={() => setActiveInfoTab('activity')} />
                  <TabButton label={`Pending (${pendingOrders.length})`} active={activeInfoTab === 'pending'} onClick={() => setActiveInfoTab('pending')} />
                  <TabButton label="Schedule" active={activeInfoTab === 'schedule'} onClick={() => setActiveInfoTab('schedule')} />
                </div>
              )}

              {!panelMinimized && (
                <div className="scrollable" style={{ padding: '1.5rem', flex: 1 }}>
                  {activeInfoTab === 'activity' && (
                    <div className="activity-feed">
                      {activityFeed.map((item, idx) => (
                        <div key={idx} className={`activity-item ${['ALERT', 'SYSTEM'].includes(item.type) ? 'has-icon' : ''}`}>
                          <div className="activity-content">
                            {item.type === 'ALERT' && <AlertTriangle size={14} color="var(--failed)" style={{ marginTop: '3px', flexShrink: 0 }} />}
                            {item.type === 'SYSTEM' && <Info size={14} color="var(--accent-blue)" style={{ marginTop: '3px', flexShrink: 0 }} />}
                            <div className="activity-details">
                              <span>
                                <b>[{item.user}]</b> {item.msg}
                              </span>
                              <div className="activity-time">{item.time}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeInfoTab === 'pending' && (
                    <div id="pending-list">
                      {pendingOrders.map(order => (
                        <div
                          key={order.id}
                          onClick={() => setFocusedLocation({ lat: order.lat, lng: order.lng })}
                          className="pending-order-card"
                          style={{ cursor: 'pointer', position: 'relative' }}
                        >
                          <div className="po-address">{order.delivery_address}</div>
                          <div className="po-meta">ID: {order.id.substring(0, 8)} | Priority: {order.priority}</div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openOrderEditor(order); }}
                            className="icon-btn"
                            style={{ position: 'absolute', right: '35px', top: '50%', transform: 'translateY(-50%)' }}
                            title="Edit Order"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order); }}
                            className="icon-btn"
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--failed)' }}
                            title="Delete Order"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeInfoTab === 'schedule' && (
                    selectedDriver ? (
                      <div className="timeline">
                        <h4 id="schedule-driver-name">{selectedDriver.full_name}</h4>
                        {driverSchedule.length > 0 ? driverSchedule.map((stop, idx) => (
                          <div key={stop.stop_id} className={`timeline-item ${stop.stop_status.toLowerCase()}`}>
                            <div className="timeline-dot"></div>
                            <div className="timeline-content">
                              <div className="timeline-time">
                                #{idx + 1} • {new Date(stop.estimated_arrival_time).toLocaleTimeString()}
                              </div>
                              <div className="timeline-address">{stop.delivery_address}</div>
                              <div className="timeline-id">Status: {stop.stop_status}</div>
                            </div>
                          </div>
                        )) : (
                          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>No stops assigned</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>Select a driver to view schedule</div>
                    )
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* Other Views Placeholder */}
        {activeView === 'fleet' && (
          <section className="glass" style={{ height: '100%', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            <h3>Shift & Assignment Board</h3>
            <div className="scrollable" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', alignContent: 'start' }}>
              {drivers.map(d => {
                const isOnline = d.last_seen && (new Date() - new Date(d.last_seen)) < (5 * 60 * 1000);
                return (
                  <div key={d.id} className="driver-mini-card" style={{ cursor: 'pointer' }} onClick={() => openDriverEditor(d)}>
                    <div className="driver-header" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="status-dot" style={{ background: isOnline ? 'var(--delivered)' : '#666', boxShadow: isOnline ? '0 0 8px var(--delivered)' : 'none' }}></div>
                        <div>
                          <b style={{ display: 'block' }}>{d.full_name}</b>
                          <small style={{ color: 'var(--accent-blue)' }}>{d.assigned_vehicle || 'No Vehicle'}</small>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.6rem' }} onClick={(e) => { e.stopPropagation(); checkIn(d.id); }}>Start Shift</button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.6rem' }} onClick={(e) => { e.stopPropagation(); checkOut(d.id); }}>End Shift</button>
                      </div>
                    </div>
                    <div className="activity-content" style={{ marginTop: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>Live Status: <b>{isOnline ? 'ONLINE' : 'OFFLINE'}</b></div>
                      <div style={{ fontSize: '0.75rem', color: '#fff' }}>📞 {d.contact_number || '-'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeView === 'vehicles' && (
          <section className="glass" style={{ height: '100%', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Managed Vehicles</h3>
              <button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => openVehicleEditor(null)}>+ New Vehicle</button>
            </div>
            <div className="scrollable" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', alignContent: 'start' }}>
              {vehicles.map(v => (
                <div key={v.id} className="driver-mini-card" style={{ cursor: 'pointer' }} onClick={() => openVehicleEditor(v)}>
                  <div className="driver-header">
                    <div className="status-dot" style={{ background: v.last_activity ? 'var(--delivered)' : '#666' }}></div>
                    <b>{v.plate_number}</b>
                  </div>
                  <div className="activity-content">
                    <div>Type: {v.type} | Cap: {v.capacity_weight}kg</div>
                    <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '4px' }}>
                      Last Activity: {v.last_activity ? new Date(v.last_activity).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeView === 'drivers' && (
          <section className="glass" style={{ height: '100%', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Managed Drivers</h3>
              <button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => openDriverEditor(null)}>+ New Driver</button>
            </div>
            <div className="scrollable" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', alignContent: 'start' }}>
              {drivers.map(d => (
                <div key={d.id} className="driver-mini-card" style={{ cursor: 'pointer' }} onClick={() => openDriverEditor(d)}>
                  <div className="driver-header">
                    <div className="status-dot" style={{ background: d.is_active ? 'var(--delivered)' : 'var(--failed)' }}></div>
                    <b>{d.full_name}</b>
                  </div>
                  <div className="activity-content">
                    <div>Status: {d.is_active ? 'Active' : 'Offline/Disabled'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#fff', margin: '2px 0' }}>📞 {d.contact_number || 'No Contact Info'}</div>
                    <div style={{ color: 'var(--accent-blue)', fontSize: '0.75rem' }}>Assigned: {d.assigned_vehicle || 'NONE'}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeView === 'analytics' && (
          <div className="glass" style={{ height: '100%', padding: '2rem', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '2rem' }}>Fleet Performance Analytics</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
              <div className="glass" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--accent-blue)' }}>Efficiency Trend (Last 30 Days)</h4>
                <div style={{ height: '300px' }}>
                  <Line
                    data={{
                      labels: analyticsData.map(d => new Date(d.date).toLocaleDateString()),
                      datasets: [{
                        label: 'Efficiency Score (%)',
                        data: analyticsData.map(d => d.avg_efficiency),
                        borderColor: '#00d2ff',
                        backgroundColor: 'rgba(0, 210, 255, 0.1)',
                        tension: 0.4,
                        fill: true
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.1)' } },
                        x: { grid: { display: false } }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="glass" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--delivered)' }}>Orders Completed</h4>
                <div style={{ height: '300px' }}>
                  <Bar
                    data={{
                      labels: analyticsData.map(d => new Date(d.date).toLocaleDateString()),
                      datasets: [{
                        label: 'Total Orders',
                        data: analyticsData.map(d => d.total_completed),
                        backgroundColor: '#00ff88',
                        borderRadius: 4
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                        x: { grid: { display: false } }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="glass" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
              <h4 style={{ marginBottom: '1rem', color: '#9d50bb' }}>Average Service Time (mins)</h4>
              <div style={{ height: '300px' }}>
                <Line
                  data={{
                    labels: analyticsData.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [{
                      label: 'Avg Service Time (mins)',
                      data: analyticsData.map(d => d.avg_service_time),
                      borderColor: '#9d50bb',
                      backgroundColor: 'rgba(157, 80, 187, 0.1)',
                      tension: 0.4,
                      fill: true
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main >

      {/* Order Editor Modal */}
      {
        showOrderEditor && (
          <div className="editor-overlay active glass">
            <div className="editor-header">
              <h3>{selectedOrder ? 'Edit Order' : 'Add Order'}</h3>
              <button onClick={() => setShowOrderEditor(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSaveOrder} className="editor-body">
              <div className="form-group">
                <label>Address / Postal Code</label>
                <input
                  name="delivery_address"
                  type="text"
                  defaultValue={selectedOrder?.delivery_address}
                  placeholder="Enter address or 6-digit postal"
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    name="contact_person"
                    type="text"
                    defaultValue={selectedOrder?.contact_person}
                    placeholder="e.g. Mrs. Lee"
                  />
                </div>
                <div className="form-group">
                  <label>Contact Mobile</label>
                  <input
                    name="contact_mobile"
                    type="text"
                    defaultValue={selectedOrder?.contact_mobile}
                    placeholder="e.g. 91234567"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {selectedOrder ? 'Save Changes' : 'Create Order'}
                </button>
                {selectedOrder && (
                  <button type="button" onClick={handleDeleteOrder} className="btn btn-danger">
                    Delete Order
                  </button>
                )}
                <button type="button" onClick={() => setShowOrderEditor(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )
      }

      {/* Vehicle Editor Modal */}
      {showVehicleEditor && (
        <div className="editor-overlay active glass">
          <div className="editor-header">
            <h3>{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
            <button onClick={() => setShowVehicleEditor(false)} className="close-btn">&times;</button>
          </div>
          <form onSubmit={handleSaveVehicle} className="editor-body">
            <div className="form-group">
              <label>Plate Number</label>
              <input
                name="plate_number"
                type="text"
                defaultValue={editingVehicle?.plate_number}
                placeholder="e.g. GBA-1234-X"
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Vehicle Type</label>
                <select name="type" defaultValue={editingVehicle?.type || 'VAN'}>
                  <option value="VAN">Van</option>
                  <option value="TRUCK">Truck</option>
                  <option value="BIKE">Bike</option>
                </select>
              </div>
              <div className="form-group">
                <label>Capacity (kg)</label>
                <input
                  name="capacity_weight"
                  type="number"
                  defaultValue={editingVehicle?.capacity_weight || 500}
                  placeholder="e.g. 500"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingVehicle ? 'Save Changes' : 'Create Vehicle'}
              </button>
              {editingVehicle && (
                <button type="button" onClick={handleDeleteVehicle} className="btn btn-danger">
                  Delete Vehicle
                </button>
              )}
              <button type="button" onClick={() => setShowVehicleEditor(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Driver Editor Modal */}
      {showDriverEditor && (
        <div className="editor-overlay active glass">
          <div className="editor-header">
            <h3>{editingDriver ? 'Edit Driver' : 'Add Driver'}</h3>
            <button onClick={() => setShowDriverEditor(false)} className="close-btn">&times;</button>
          </div>
          <form onSubmit={handleSaveDriver} className="editor-body">
            <div className="form-group">
              <label>Full Name</label>
              <input
                name="full_name"
                type="text"
                defaultValue={editingDriver?.full_name}
                placeholder="e.g. John Doe"
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Contact Number</label>
                <input
                  name="contact_number"
                  type="text"
                  defaultValue={editingDriver?.contact_number}
                  placeholder="e.g. 91234567"
                />
              </div>
              <div className="form-group">
                <label>Assigned Vehicle</label>
                <select name="assigned_vehicle" defaultValue={editingDriver?.assigned_vehicle || ''}>
                  <option value="">-- None --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.plate_number}>{v.plate_number} ({v.type})</option>
                  ))}
                </select>
              </div>
            </div>
            {!editingDriver && (
              <div className="form-row">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    name="username"
                    type="text"
                    placeholder="e.g. johndoe"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    name="password"
                    type="password"
                    placeholder="******"
                    required
                  />
                </div>
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingDriver ? 'Save Changes' : 'Create Driver'}
              </button>
              {editingDriver && (
                <button type="button" onClick={handleDeleteDriver} className="btn btn-danger">
                  Delete Driver
                </button>
              )}
              <button type="button" onClick={() => setShowDriverEditor(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="editor-overlay active glass">
          <div className="editor-header" style={{ borderBottom: 'none' }}>
            <h3>Confirm Deletion</h3>
            <button onClick={() => setShowDeleteConfirm(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
              Are you sure you want to delete the order for <b>{orderToDelete?.delivery_address}</b>?
              <br />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>This action cannot be undone.</span>
            </p>
            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button onClick={confirmDeleteOrder} className="btn btn-danger">
                Yes, Delete Order
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Delete Confirmation Modal */}
      {showVehicleDeleteConfirm && (
        <div className="editor-overlay active glass">
          <div className="editor-header" style={{ borderBottom: 'none' }}>
            <h3>Confirm Vehicle Deletion</h3>
            <button onClick={() => setShowVehicleDeleteConfirm(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
              Are you sure you want to delete vehicle <b>{vehicleToDelete?.plate_number}</b>?
              <br />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>This action cannot be undone.</span>
            </p>
            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button onClick={confirmDeleteVehicle} className="btn btn-danger">
                Yes, Delete Vehicle
              </button>
              <button onClick={() => setShowVehicleDeleteConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Delete Confirmation Modal */}
      {showDriverDeleteConfirm && (
        <div className="editor-overlay active glass">
          <div className="editor-header" style={{ borderBottom: 'none' }}>
            <h3>Confirm Driver Deletion</h3>
            <button onClick={() => setShowDriverDeleteConfirm(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
              Are you sure you want to delete driver <b>{driverToDelete?.full_name}</b>?
              <br />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>This action cannot be undone.</span>
            </p>
            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button onClick={confirmDeleteDriver} className="btn btn-danger">
                Yes, Delete Driver
              </button>
              <button onClick={() => setShowDriverDeleteConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Toasts */}
      {/* Alert Toasts Removed */}
      {/* <div id="alert-toast-container">...</div> */}
    </div >
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`nav-item ${active ? 'active' : ''}`}
    >
      <span className="icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`tab-btn ${active ? 'active' : ''}`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
