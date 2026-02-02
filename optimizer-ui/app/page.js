'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { io } from 'socket.io-client';
import { Download, Plus, Zap, AlertTriangle, X, Info, Minus, Maximize2, GripHorizontal, Edit, Trash2, RefreshCcw, Calendar, Home } from 'lucide-react';
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
  const [showClearRoutesConfirm, setShowClearRoutesConfirm] = useState(false);
  const [showDeleteAllPendingConfirm, setShowDeleteAllPendingConfirm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [periods, setPeriods] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [showPeriodManager, setShowPeriodManager] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [periodAssignments, setPeriodAssignments] = useState([]);
  const [warehouse, setWarehouse] = useState(null);
  const [showWarehouseEditor, setShowWarehouseEditor] = useState(false);
  const [showRouteDeleteConfirm, setShowRouteDeleteConfirm] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState(null);

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
    try {
      // 1. Fetch Routes (Single Date or Range/Period)
      let routesUrl = `${API_BASE}/routes`;
      if (currentPeriod) {
        routesUrl += `?start_date=${currentPeriod.start_date}&end_date=${currentPeriod.end_date}`;
      } else {
        routesUrl += `?date=${selectedDate}`;
      }

      console.log('Fetching routes from:', routesUrl); // Debug log
      try {
        const routesRes = await fetch(routesUrl);
        if (routesRes.ok) {
          const routesData = await routesRes.json();
          setRoutes(routesData);
        } else {
          console.error('Failed to fetch routes, status:', routesRes.status);
        }
      } catch (fetchErr) {
        console.error('Network error fetching routes:', fetchErr);
      }

      // 2. Fetch Periods
      const periodsRes = await fetch(`${API_BASE}/periods`);
      if (periodsRes.ok) {
        const pData = await periodsRes.json();
        console.log('📅 Periods fetched:', pData);
        setPeriods(pData);
      } else {
        console.error('Failed to fetch periods:', periodsRes.status);
      }

      // 3. Fetch current period assignments if applicable
      if (currentPeriod) {
        const assignRes = await fetch(`${API_BASE}/periods/${currentPeriod.id}/assignments`);
        if (assignRes.ok) {
          const aData = await assignRes.json();
          setPeriodAssignments(aData);
        }
      } else {
        setPeriodAssignments([]);
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

        // Deduplicate data to prevent React key errors
        const uniqueDrivers = (data.drivers || []).filter((obj, pos, arr) => {
          return arr.map(mapObj => mapObj.id).indexOf(obj.id) === pos;
        });
        const uniqueVehicles = (data.vehicles || []).filter((obj, pos, arr) => {
          return arr.map(mapObj => mapObj.id).indexOf(obj.id) === pos;
        });

        setDrivers(uniqueDrivers);
        setVehicles(uniqueVehicles);

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

      // Fetch default warehouse
      const warehouseRes = await fetch(`${API_BASE}/warehouse/default`);
      if (warehouseRes.ok) {
        const wData = await warehouseRes.json();
        setWarehouse(wData);
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
  }, [addActivity, selectedDate, currentPeriod]);

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
    const targetDate = currentPeriod ? currentPeriod.start_date : selectedDate;
    addActivity('USER', `Starting optimization cycle for ${targetDate}...`);
    try {
      const res = await fetch(`${API_BASE}/optimize?date=${targetDate}`, { method: 'POST' });
      const data = await res.json();
      addActivity('AI', `Optimization complete for ${targetDate}. Assigned ${data.optimizer?.orders_assigned || 0} orders.`);
      await fetchData();
    } catch (err) {
      addActivity('ERROR', 'Optimization failed.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleClearRoutes = () => {
    setShowClearRoutesConfirm(true);
  };

  const confirmClearRoutes = async () => {
    try {
      const res = await fetch(`${API_BASE}/routes?date=${selectedDate}`, { method: 'DELETE' });
      const data = await res.json();
      addActivity('SYSTEM', `Routes for ${selectedDate} cleared and orders reset.`);
      setShowClearRoutesConfirm(false);
      await fetchData();
    } catch (err) {
      addActivity('ERROR', 'Failed to clear routes.');
    }
  };

  const handleDeleteAllPending = () => {
    console.log('🗑️ Delete All Pending clicked');
    setShowDeleteAllPendingConfirm(true);
  };

  const confirmDeleteAllPending = async () => {
    console.log('Confirming delete all pending...');
    try {
      const res = await fetch(`${API_BASE}/orders/pending`, { method: 'DELETE' });
      console.log('Delete response status:', res.status);
      const data = await res.json();
      console.log('Delete response data:', data);
      addActivity('SYSTEM', data.message || 'Pending orders deleted.');
      setShowDeleteAllPendingConfirm(false);
      await fetchData();
    } catch (err) {
      console.error('Error deleting pending orders:', err);
      addActivity('ERROR', 'Failed to delete pending orders.');
    }
  };

  const handleWarehouseMove = (lat, lng) => {
    setWarehouse(prev => ({ ...prev, lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) }));
  };

  const handleRouteOrderClick = (route, stop) => {
    setRouteToDelete(route);
    setShowRouteDeleteConfirm(true);
  };

  const confirmDeleteRoute = async () => {
    if (!routeToDelete) return;
    try {
      const res = await fetch(`${API_BASE}/routes/${routeToDelete.route_id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete route');

      const data = await res.json();
      addActivity('SYSTEM', data.message || `Route cancelled.`);
      setShowRouteDeleteConfirm(false);
      setRouteToDelete(null);
      await fetchData();
    } catch (err) {
      console.error('Error deleting route:', err);
      addActivity('ERROR', 'Failed to delete route.');
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/reports/daily?date=${selectedDate}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${selectedDate}.csv`;
      a.click();
      addActivity('SYSTEM', `Report for ${selectedDate} downloaded successfully.`);
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

  const openPeriodEditor = (period) => {
    setEditingPeriod(period);
    setShowPeriodManager(true);
  };

  const handleSavePeriod = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const pData = Object.fromEntries(formData.entries());

    try {
      const url = editingPeriod ? `${API_BASE}/periods/${editingPeriod.id}` : `${API_BASE}/periods`;
      const method = editingPeriod ? 'PATCH' : 'POST';
      const params = new URLSearchParams();
      params.append('name', pData.name);
      params.append('start_date', pData.start_date);
      params.append('end_date', pData.end_date);

      console.log('Saving period:', { url, method, params: params.toString() });
      const res = await fetch(`${url}?${params.toString()}`, { method });

      console.log('Save response status:', res.status);
      const responseData = await res.json();
      console.log('Save response data:', responseData);

      if (!res.ok) {
        console.error('Period save failed:', responseData);
        throw new Error('Failed to save period');
      }

      console.log('✅ Period saved successfully!');
      addActivity('SYSTEM', `Period ${editingPeriod ? 'updated' : 'created'} successfully.`);
      setEditingPeriod(null);
      setShowPeriodManager(false);
      await fetchData();
    } catch (err) {
      console.error('Error saving period:', err);
      addActivity('ERROR', `Failed to save period: ${err.message}`);
    }
  };

  const handleDeletePeriod = async (id) => {
    if (!confirm('Are you sure you want to delete this period? This will also remove all driver assignments for this period.')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/periods/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addActivity('SYSTEM', 'Period deleted successfully.');
        // If we're currently viewing the deleted period, switch to daily view
        if (currentPeriod?.id === id) {
          setCurrentPeriod(null);
        }
        await fetchData();
      } else {
        throw new Error('Failed to delete period');
      }
    } catch (err) {
      console.error('Error deleting period:', err);
      addActivity('ERROR', 'Failed to delete period.');
    }
  };
  const toggleDriverPeriodAssignment = async (driverId) => {
    // We can assign to either the period we are currently editing in the manager, or the active page period
    const periodId = editingPeriod?.id || currentPeriod?.id;
    if (!periodId) return;

    const isAssigned = periodAssignments.includes(driverId);
    const method = isAssigned ? 'DELETE' : 'POST';
    const url = `${API_BASE}/periods/${periodId}/drivers/${driverId}`;

    try {
      const res = await fetch(url, { method });
      if (res.ok) {
        setPeriodAssignments(prev =>
          isAssigned ? prev.filter(id => id !== driverId) : [...prev, driverId]
        );
        addActivity('SYSTEM', `Driver ${isAssigned ? 'removed' : 'added'} to roster.`);
      }
    } catch (err) {
      addActivity('ERROR', 'Failed to update roster.');
    }
  };

  const renderDriverCard = (d, isRostered) => {
    const isOnline = d.last_seen && (new Date() - new Date(d.last_seen)) < (5 * 60 * 1000);
    const vehicle = vehicles.find(v => v.plate_number === d.assigned_vehicle);

    return (
      <div
        key={d.id}
        className="driver-mini-card glass"
        style={{
          cursor: 'pointer',
          borderLeft: isOnline ? '4px solid var(--delivered)' : '4px solid transparent',
          opacity: (currentPeriod && !isRostered) ? 0.7 : 1,
          transition: 'all 0.3s ease'
        }}
        onClick={() => openDriverEditor(d)}
      >
        <div className="driver-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="status-dot" style={{ background: isOnline ? 'var(--delivered)' : '#666', boxShadow: isOnline ? '0 0 8px var(--delivered)' : 'none' }}></div>
            <div>
              <b style={{ display: 'block' }}>{d.full_name}</b>
              <small style={{ color: 'var(--accent-blue)' }}>{d.assigned_vehicle} ({vehicle?.type || 'No Vehicle'})</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {currentPeriod ? (
              <button
                className={`btn ${isRostered ? 'btn-secondary' : 'btn-primary'}`}
                style={{ padding: '6px 12px', fontSize: '0.65rem' }}
                onClick={(e) => { e.stopPropagation(); toggleDriverPeriodAssignment(d.id); }}
              >
                {isRostered ? 'Remove' : 'Assign'}
              </button>
            ) : (
              <>
                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.65rem' }} onClick={(e) => { e.stopPropagation(); checkIn(d.id); }}>Start</button>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.65rem' }} onClick={(e) => { e.stopPropagation(); checkOut(d.id); }}>End</button>
              </>
            )}
          </div>
        </div>
        <div className="activity-content" style={{ marginTop: '10px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
            <span>Capacity: <b>{vehicle?.capacity_weight || 0}kg</b></span>
            <span>Status: <b style={{ color: isOnline ? 'var(--delivered)' : 'inherit' }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</b></span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📞 {d.contact_number || 'N/A'}</span>
            {currentPeriod && isRostered && <span style={{ color: 'var(--delivered)', fontSize: '0.65rem', fontWeight: 'bold' }}>ROSTERED</span>}
          </div>
        </div>
      </div>
    );
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
      params.append('is_active', e.target.is_active.checked);

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

  const handleSaveWarehouse = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const wData = Object.fromEntries(formData.entries());

    try {
      const url = warehouse ? `${API_BASE}/warehouse/${warehouse.id}` : `${API_BASE}/warehouse`;
      const method = warehouse ? 'PATCH' : 'POST';

      const body = JSON.stringify({
        ...wData,
        lat: parseFloat(wData.lat),
        lng: parseFloat(wData.lng),
        is_default: true
      });

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (!res.ok) {
        throw new Error('Failed to save warehouse');
      }

      addActivity('SYSTEM', 'Warehouse location updated.');
      setShowWarehouseEditor(false);
      await fetchData();
    } catch (err) {
      console.error('Error saving warehouse:', err);
      addActivity('ERROR', 'Failed to save warehouse location.');
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
          <h3>Active Drivers Online</h3>
          <div className="scrollable" style={{ flex: 1 }}>
            {(() => {
              const onlineDrivers = drivers.filter(d => d.last_seen && (new Date() - new Date(d.last_seen)) < (5 * 60 * 1000));

              if (onlineDrivers.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    No drivers currently online
                  </div>
                );
              }

              return onlineDrivers.map(driver => (
                <div
                  key={driver.id}
                  onClick={() => showDriverSchedule(driver)}
                  className={`driver-mini-card ${selectedDriver?.id === driver.id ? 'active' : ''}`}
                >
                  <div className="driver-header">
                    <div className="status-dot" style={{
                      background: 'var(--delivered)',
                      boxShadow: '0 0 8px var(--delivered)'
                    }}></div>
                    <span style={{ color: 'white' }}>{driver.full_name}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    Live Tracking Active
                  </div>
                </div>
              ));
            })()}
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
                onRouteOrderClick={handleRouteOrderClick}
                focusedLocation={focusedLocation}
                warehouse={warehouse}
                onWarehouseMove={handleWarehouseMove}
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
                <div className="period-switcher glass" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginRight: '16px',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)'
                }}>
                  <Calendar size={14} color="var(--accent-blue)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase' }}>Current Period</span>
                    <select
                      value={currentPeriod?.id || 'daily'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'daily') setCurrentPeriod(null);
                        else setCurrentPeriod(periods.find(p => p.id === val));
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: '0.8rem',
                        outline: 'none',
                        cursor: 'pointer',
                        padding: '0'
                      }}
                    >
                      <option value="daily" style={{ background: '#1a1d29' }}>Daily Focus ({selectedDate})</option>
                      {(() => {
                        console.log('Rendering periods dropdown, periods:', periods);
                        return periods.map(p => (
                          <option key={p.id} value={p.id} style={{ background: '#1a1d29' }}>{p.name}</option>
                        ));
                      })()}
                    </select>
                  </div>
                  {currentPeriod ? (
                    <div
                      onClick={() => setCurrentPeriod(null)}
                      style={{ cursor: 'pointer', color: 'var(--failed)', fontSize: '0.9rem', padding: '4px' }}
                      title="Clear Period"
                    >
                      <X size={14} />
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: '0.8rem',
                        outline: 'none',
                        cursor: 'pointer',
                        width: '110px'
                      }}
                    />
                  )}
                  <button
                    onClick={() => setShowPeriodManager(true)}
                    className="icon-btn"
                    style={{ marginLeft: '4px', opacity: 0.7 }}
                    title="Manage Periods"
                  >
                    <Edit size={12} />
                  </button>
                </div>
                <button
                  onClick={() => setShowWarehouseEditor(true)}
                  className="btn btn-secondary"
                  title="Warehouse Location"
                >
                  <Home size={16} /> Depot
                </button>
                <button onClick={handleDownloadReport} className="btn btn-secondary">
                  <Download size={16} /> Download
                </button>
                <button onClick={() => openOrderEditor(null)} className="btn btn-secondary">
                  <Plus size={16} /> Order
                </button>
                <button onClick={handleClearRoutes} className="btn btn-secondary" style={{ color: 'var(--failed)' }}>
                  <RefreshCcw size={16} /> Clear
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
                  {(() => {
                    const processedCount = routes.reduce((acc, r) => acc + (r.stops ? r.stops.length : 0), 0);
                    return (
                      <TabButton label={`Processed (${processedCount})`} active={activeInfoTab === 'processed'} onClick={() => setActiveInfoTab('processed')} />
                    );
                  })()}
                  <TabButton label="Schedule" active={activeInfoTab === 'schedule'} onClick={() => setActiveInfoTab('schedule')} />
                </div>
              )}

              {!panelMinimized && (
                <div className="scrollable" style={{ padding: '1.5rem', flex: 1 }}>
                  {activeInfoTab === 'activity' && (
                    <div className="activity-feed">
                      {activityFeed.length > 0 && (
                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setActivityFeed([])}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '0.7rem',
                              padding: '4px 8px',
                              borderColor: 'var(--text-dim)',
                              color: 'var(--text-dim)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <X size={12} /> Clear Activity
                          </button>
                        </div>
                      )}
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
                      {pendingOrders.length > 0 && (
                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={handleDeleteAllPending}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '0.7rem',
                              padding: '4px 8px',
                              borderColor: 'var(--failed)',
                              color: 'var(--failed)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} /> Delete All Pending
                          </button>
                        </div>
                      )}
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

                  {activeInfoTab === 'processed' && (
                    <div id="processed-list">
                      {routes.length === 0 && (
                        <div className="empty-state">No processed orders found</div>
                      )}

                      {routes.flatMap(r => r.stops.map(s => ({ ...s, route_id: r.route_id, driver_name: r.full_name })))
                        .sort((a, b) => new Date(a.estimated_arrival_time) - new Date(b.estimated_arrival_time))
                        .map(stop => (
                          <div
                            key={stop.stop_id}
                            onClick={() => setFocusedLocation({ lat: stop.lat, lng: stop.lng })}
                            className="pending-order-card"
                            style={{ cursor: 'pointer', position: 'relative', borderLeft: `3px solid var(--${stop.stop_status === 'DELIVERED' ? 'delivered' : 'assigned'})` }}
                          >
                            <div className="po-address">{stop.delivery_address}</div>
                            <div className="po-meta">
                              Status: <span className={`status-tag ${stop.stop_status.toLowerCase()}`}>{stop.stop_status}</span>
                              | Driver: {stop.driver_name}
                            </div>
                            <div className="po-meta" style={{ fontSize: '0.7rem' }}>
                              ETA: {new Date(stop.estimated_arrival_time).toLocaleTimeString()}
                            </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '4px' }}>Shift & Assignment Board</h3>
                <small style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                  Period: {currentPeriod ? `${currentPeriod.name} (${currentPeriod.start_date} to ${currentPeriod.end_date})` :
                    `${new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${selectedDate === new Date().toISOString().split('T')[0] ? ' (Today)' : ''}`}
                </small>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Select Period:</span>
                  <select
                    value={currentPeriod?.id || 'daily'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'daily') setCurrentPeriod(null);
                      else setCurrentPeriod(periods.find(p => p.id === val));
                    }}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: 'white',
                      fontSize: '0.8rem',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="daily" style={{ background: '#1a1d29' }}>Daily View</option>
                    {periods.map(p => (
                      <option key={p.id} value={p.id} style={{ background: '#1a1d29' }}>{p.name} ({p.start_date} to {p.end_date})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { setEditingPeriod(null); setShowPeriodManager(true); }}
                  className="btn btn-primary"
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                >
                  <Plus size={14} /> Create New Period
                </button>
                <span className="badge" style={{ background: 'rgba(0,210,255,0.1)', color: 'var(--accent-blue)' }}>
                  Targeting: In-Service Vehicles Only
                </span>
              </div>
            </div>

            <div className="scrollable" style={{ flex: 1 }}>
              {(() => {
                const activeDrivers = drivers.filter(d => {
                  const v = vehicles.find(veh => veh.plate_number === d.assigned_vehicle);
                  return v && v.is_active;
                });

                if (activeDrivers.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                      <p>No drivers with <b>In-Service</b> vehicles assigned.</p>
                      <small>Enable vehicles in the "Vehicles" tab to see them here.</small>
                    </div>
                  );
                }

                // If a period is selected, show Roster management
                if (currentPeriod) {
                  const rostered = activeDrivers.filter(d => periodAssignments.includes(d.id));
                  const unassigned = activeDrivers.filter(d => !periodAssignments.includes(d.id));

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      <div>
                        <h4 style={{ color: 'var(--delivered)', marginBottom: '1rem', borderBottom: '1px solid rgba(0,255,150,0.1)', paddingBottom: '8px' }}>
                          Rostered for {currentPeriod.name} ({rostered.length})
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                          {rostered.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No drivers rostered yet.</p>}
                          {rostered.map(d => renderDriverCard(d, true))}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ color: 'var(--text-dim)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                          Available Pool (Not in Roster)
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                          {unassigned.map(d => renderDriverCard(d, false))}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Default Today/Daily view
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                    {activeDrivers.map(d => renderDriverCard(d))}
                  </div>
                );
              })()}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Type: {v.type} | Cap: {v.capacity_weight}kg</span>
                      <span style={{
                        color: v.is_active ? 'var(--delivered)' : 'var(--failed)',
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}>
                        {v.is_active ? 'IN SERVICE' : 'OUT OF SERVICE'}
                      </span>
                    </div>
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
              {drivers.map(d => {
                const isOnline = d.last_seen && (new Date() - new Date(d.last_seen)) < (5 * 60 * 1000);
                return (
                  <div key={d.id} className="driver-mini-card" style={{ cursor: 'pointer' }} onClick={() => openDriverEditor(d)}>
                    <div className="driver-header">
                      <div className="status-dot" style={{
                        background: isOnline ? 'var(--delivered)' : '#666',
                        boxShadow: isOnline ? '0 0 8px var(--delivered)' : 'none'
                      }}></div>
                      <b>{d.full_name}</b>
                    </div>
                    <div className="activity-content">
                      <div style={{ color: isOnline ? 'var(--delivered)' : 'var(--text-dim)', fontWeight: '600' }}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#aaa', margin: '4px 0' }}>
                        Account: {d.is_active ? 'Active' : 'Disabled'} | 📞 {d.contact_number || '-'}
                      </div>
                      <div style={{ color: 'var(--accent-blue)', fontSize: '0.75rem' }}>Vehicle: {d.assigned_vehicle || 'NONE'}</div>
                    </div>
                  </div>
                );
              })}
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
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={editingVehicle ? editingVehicle.is_active : true}
                id="vehicle-is-active"
                style={{ width: '18px', height: '18px' }}
              />
              <label htmlFor="vehicle-is-active" style={{ marginBottom: 0 }}>Vehicle is In Service (Available for Routes)</label>
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
                  {vehicles
                    .filter(v => v.is_active || v.plate_number === editingDriver?.assigned_vehicle)
                    .map(v => (
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

      {/* Warehouse Editor Modal */}
      {showWarehouseEditor && (
        <div className="editor-overlay active glass">
          <div className="editor-header">
            <h3>Warehouse / Depot Location</h3>
            <button onClick={() => setShowWarehouseEditor(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body">
            <form onSubmit={handleSaveWarehouse}>
              <div className="form-group">
                <label>Warehouse Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={warehouse?.name || 'Main Warehouse'}
                  placeholder="e.g. Central Depot"
                  required
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  defaultValue={warehouse?.address || ''}
                  placeholder="Full Address"
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Latitude</label>
                  <input
                    key={`lat-${warehouse?.lat}`}
                    type="number"
                    name="lat"
                    step="any"
                    defaultValue={warehouse?.lat || 1.3521}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <input
                    key={`lng-${warehouse?.lng}`}
                    type="number"
                    name="lng"
                    step="any"
                    defaultValue={warehouse?.lng || 103.8198}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Save Location
                </button>
                <button
                  type="button"
                  onClick={() => setShowWarehouseEditor(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Route Cancel Confirmation Modal */}
      {showRouteDeleteConfirm && (
        <div className="editor-overlay active glass">
          <div className="editor-header" style={{ borderBottom: 'none' }}>
            <h3>Confirm Route Cancellation</h3>
            <button onClick={() => setShowRouteDeleteConfirm(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
              Are you sure you want to cancel the route assigned to <b>{routeToDelete?.full_name || 'Driver'}</b>?
              <br />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                This will reset <b>{routeToDelete?.stops?.length || 0}</b> orders to PENDING.
              </span>
            </p>
            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button onClick={confirmDeleteRoute} className="btn btn-danger">
                Yes, Cancel Route
              </button>
              <button onClick={() => setShowRouteDeleteConfirm(false)} className="btn btn-secondary">
                No, Keep Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Routes Confirmation Modal */}
      {showClearRoutesConfirm && (
        <div className="editor-overlay active glass">
          <div className="editor-header" style={{ borderBottom: 'none' }}>
            <h3>Confirm Clear Routes</h3>
            <button onClick={() => setShowClearRoutesConfirm(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
              Are you sure you want to clear all routes for today?
              <br />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>This will reset all orders back to the PENDING state.</span>
            </p>
            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button onClick={confirmClearRoutes} className="btn btn-danger">
                Yes, Clear All Routes
              </button>
              <button onClick={() => setShowClearRoutesConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Pending Confirmation Modal */}
      {showDeleteAllPendingConfirm && (
        <div className="editor-overlay active glass">
          <div className="editor-header" style={{ borderBottom: 'none' }}>
            <h3>Confirm Delete All Orders</h3>
            <button onClick={() => setShowDeleteAllPendingConfirm(false)} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
              Are you sure you want to delete ALL pending orders?
              <br />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>This action cannot be undone.</span>
            </p>
            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button onClick={confirmDeleteAllPending} className="btn btn-danger">
                Yes, Delete Everything
              </button>
              <button onClick={() => setShowDeleteAllPendingConfirm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Period Manager Modal */}
      {showPeriodManager && (
        <div className="editor-overlay active glass">
          <div className="editor-header">
            <h3>{editingPeriod ? 'Edit Period' : 'Manage Planning Periods'}</h3>
            <button onClick={() => { setShowPeriodManager(false); setEditingPeriod(null); }} className="close-btn">&times;</button>
          </div>
          <div className="editor-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <form onSubmit={handleSavePeriod} style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <div className="form-group">
                <label>Period Name (e.g. Week 5, Feb Rush)</label>
                <input
                  name="name"
                  type="text"
                  defaultValue={editingPeriod?.name}
                  placeholder="Enter period name..."
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    name="start_date"
                    type="date"
                    defaultValue={editingPeriod?.start_date || new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    name="end_date"
                    type="date"
                    defaultValue={editingPeriod?.end_date || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    required
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingPeriod ? 'Update Period' : 'Add New Period'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPeriodManager(false); setEditingPeriod(null); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>

            <h4>Existing Periods</h4>
            <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
              {periods.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No periods defined yet.</p>
              ) : (
                periods.map(p => (
                  <div key={p.id} className="driver-mini-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px' }}>
                    <div>
                      <b style={{ display: 'block' }}>{p.name}</b>
                      <small style={{ color: 'var(--accent-blue)' }}>{p.start_date} to {p.end_date}</small>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setEditingPeriod(p)} className="icon-btn" title="Edit"><Edit size={14} /></button>
                      <button onClick={() => handleDeletePeriod(p.id)} className="icon-btn" style={{ color: 'var(--failed)' }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {editingPeriod && (
              <div style={{ marginTop: '2rem', padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ marginBottom: '1rem' }}>Assign Drivers to "{editingPeriod.name}"</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  {drivers.map(d => (
                    <div
                      key={d.id}
                      onClick={() => toggleDriverPeriodAssignment(d.id)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: periodAssignments.includes(d.id) ? 'rgba(0, 210, 255, 0.15)' : 'rgba(255,255,255,0.05)',
                        border: periodAssignments.includes(d.id) ? '1px solid var(--accent-blue)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: periodAssignments.includes(d.id) ? 'var(--accent-blue)' : 'rgba(255,255,255,0.2)'
                        }}></div>
                        <span style={{ fontSize: '0.85rem' }}>{d.full_name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
