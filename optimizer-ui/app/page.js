'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { io } from 'socket.io-client';
import { Download, Plus, Zap, AlertTriangle, X } from 'lucide-react';

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
  const socketRef = useRef(null);

  const addActivity = useCallback((user, msg, type = 'SYSTEM') => {
    setActivityFeed(prev => [{
      user,
      msg,
      type,
      time: new Date().toLocaleTimeString()
    }, ...prev].slice(0, 50));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const routesRes = await fetch(`${API_BASE}/routes/today`);
      if (routesRes.ok) setRoutes(await routesRes.json());

      const ordersRes = await fetch(`${API_BASE}/orders?status=PENDING`);
      if (ordersRes.ok) setPendingOrders(await ordersRes.json());

      const fleetRes = await fetch(`${API_BASE}/drivers/locations`);
      if (fleetRes.ok) {
        const data = await fleetRes.json();
        setDrivers(data);
        const locs = {};
        data.forEach(d => {
          if (d.last_known_lat && d.last_known_lng) {
            locs[d.id] = { driver_id: d.id, lat: d.last_known_lat, lng: d.last_known_lng, full_name: d.full_name };
          }
        });
        setDriverLocations(locs);
      }
    } catch (err) {
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

  const totalDelivered = routes.reduce((acc, r) => acc + (r.stops?.filter(s => s.stop_status === 'DELIVERED').length || 0), 0);
  const totalStops = routes.reduce((acc, r) => acc + (r.stops?.length || 0), 0);
  const efficiency = totalStops > 0 ? Math.round((totalDelivered / totalStops) * 100) : 0;

  const driverSchedule = selectedDriver ? routes.find(r => r.driver_id === selectedDriver.id)?.stops || [] : [];

  return (
    <div className="flex h-screen bg-[#0f111a] text-white overflow-hidden p-4 gap-4">
      {/* Sidebar */}
      <aside className="w-[200px] glass flex flex-col p-6 z-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d2ff] to-[#9d50bb] shadow-[0_0_15px_rgba(0,210,255,0.4)]" />
          <h1 className="text-xl font-bold">Antigravity</h1>
        </div>

        <nav className="flex flex-col gap-2 mb-8">
          <NavItem icon="📍" label="Map & Orders" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
          <NavItem icon="🚚" label="Fleet (Assignments)" active={activeView === 'fleet'} onClick={() => setActiveView('fleet')} />
          <NavItem icon="🚛" label="Vehicles" active={activeView === 'vehicles'} onClick={() => setActiveView('vehicles')} />
          <NavItem icon="👤" label="Drivers" active={activeView === 'drivers'} onClick={() => setActiveView('drivers')} />
          <NavItem icon="📈" label="Analytics" active={activeView === 'analytics'} onClick={() => setActiveView('analytics')} />
        </nav>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <h3 className="text-[11px] uppercase tracking-wider text-[#a0a0a0] font-bold">Active Drivers</h3>
          <div className="flex-1 overflow-y-auto scrollable pr-2">
            {drivers.map(driver => (
              <div
                key={driver.id}
                onClick={() => showDriverSchedule(driver)}
                className={`p-2.5 mb-2 rounded-lg cursor-pointer transition-all ${selectedDriver?.id === driver.id ? 'bg-white/8 border border-[#00d2ff]' : 'bg-white/3 border border-white/10 hover:bg-white/8'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88]" />
                  <span className="text-sm font-semibold text-white">{driver.full_name}</span>
                </div>
                <div className="text-[10px] text-[#a0a0a0]">Live Tracking Active</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content - Full Screen Map */}
      <div className="flex-1 relative">
        {activeView === 'dashboard' && (
          <>
            {/* Map fills entire space */}
            <div className="absolute inset-0 z-0">
              <Map routes={routes} pendingOrders={pendingOrders} driverLocations={driverLocations} onOrderClick={openOrderEditor} />
            </div>

            {/* Floating Top Header */}
            <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-[1000] pointer-events-none">
              <div className="glass px-6 py-3 flex gap-8 pointer-events-auto">
                <Stat label="Today's Volume" value={totalStops} />
                <Stat label="Efficiency" value={`${efficiency}%`} />
                <Stat label="Active Routes" value={routes.length} />
              </div>

              <div className="flex gap-3 pointer-events-auto">
                <button
                  onClick={handleDownloadReport}
                  className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm flex items-center gap-2"
                >
                  <Download size={16} /> Download Report
                </button>
                <button
                  onClick={() => openOrderEditor(null)}
                  className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm flex items-center gap-2"
                >
                  <Plus size={16} /> Add Order
                </button>
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing}
                  className="px-4 py-2 rounded-lg bg-[#00d2ff] hover:bg-[#00b8e6] transition-all text-sm font-bold disabled:opacity-50 flex items-center gap-2"
                >
                  <Zap size={16} /> {isOptimizing ? 'Optimizing...' : 'Run Optimizer'}
                </button>
              </div>
            </div>

            {/* Floating Right Activity Panel */}
            <div className="absolute top-24 bottom-6 right-6 w-[380px] glass flex flex-col z-[1000] pointer-events-auto">
              <div className="flex border-b border-white/10">
                <TabButton label="Activity" active={activeInfoTab === 'activity'} onClick={() => setActiveInfoTab('activity')} />
                <TabButton label={`Pending (${pendingOrders.length})`} active={activeInfoTab === 'pending'} onClick={() => setActiveInfoTab('pending')} />
                <TabButton label="Schedule" active={activeInfoTab === 'schedule'} onClick={() => setActiveInfoTab('schedule')} />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollable">
                {activeInfoTab === 'activity' && activityFeed.map((item, idx) => (
                  <div key={idx} className={`p-3 rounded-lg ${item.type === 'ALERT' ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5'}`}>
                    <div className="text-xs">
                      <span className="font-bold text-white">[{item.user}]</span> {item.msg}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">{item.time}</div>
                  </div>
                ))}

                {activeInfoTab === 'pending' && pendingOrders.map(order => (
                  <div
                    key={order.id}
                    onClick={() => openOrderEditor(order)}
                    className="p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
                  >
                    <div className="text-sm font-bold text-white">{order.delivery_address}</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      ID: {order.id.substring(0, 8)} | Priority: {order.priority}
                    </div>
                  </div>
                ))}

                {activeInfoTab === 'schedule' && (
                  selectedDriver ? (
                    <>
                      <h4 className="text-sm font-bold mb-3">{selectedDriver.full_name}</h4>
                      {driverSchedule.length > 0 ? driverSchedule.map((stop, idx) => (
                        <div key={stop.stop_id} className="p-3 rounded-lg bg-white/5 border-l-2 border-[#00d2ff]">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-[#00d2ff]">#{idx + 1}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded ${stop.stop_status === 'DELIVERED' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                              {stop.stop_status}
                            </span>
                          </div>
                          <div className="text-xs text-white">{stop.delivery_address}</div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            ETA: {new Date(stop.estimated_arrival_time).toLocaleTimeString()}
                          </div>
                        </div>
                      )) : (
                        <div className="text-center text-gray-500 py-10 text-sm">No stops assigned</div>
                      )}
                    </>
                  ) : (
                    <div className="text-center text-gray-500 py-10 text-sm">Select a driver to view schedule</div>
                  )
                )}
              </div>
            </div>

            {/* Floating Legend */}
            <div className="absolute bottom-6 left-6 glass px-4 py-3 flex items-center gap-6 z-[1000] pointer-events-auto">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-xs font-medium">Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#00d2ff]" />
                <span className="text-xs font-medium">Assigned</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-xs font-medium">Delivered</span>
              </div>
            </div>
          </>
        )}

        {/* Other Views Placeholder */}
        {activeView !== 'dashboard' && (
          <div className="glass h-full flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">{activeView.charAt(0).toUpperCase() + activeView.slice(1)} View</h2>
              <p className="text-gray-500">Coming soon...</p>
            </div>
          </div>
        )}
      </div>

      {/* Order Editor Modal */}
      {showOrderEditor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]" onClick={() => setShowOrderEditor(false)}>
          <div className="glass p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{selectedOrder ? 'Edit Order' : 'Add Order'}</h3>
              <button onClick={() => setShowOrderEditor(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Address / Postal Code</label>
                <input
                  type="text"
                  defaultValue={selectedOrder?.delivery_address}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#00d2ff] outline-none"
                  placeholder="Enter address or 6-digit postal"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Contact Person</label>
                  <input
                    type="text"
                    defaultValue={selectedOrder?.contact_person}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. Mrs. Lee"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Contact Mobile</label>
                  <input
                    type="text"
                    defaultValue={selectedOrder?.contact_mobile}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#00d2ff] outline-none"
                    placeholder="e.g. 91234567"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button className="flex-1 py-2 rounded-lg bg-[#00d2ff] hover:bg-[#00b8e6] font-bold">
                  {selectedOrder ? 'Save Changes' : 'Create Order'}
                </button>
                {selectedOrder && (
                  <button className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Toasts */}
      <div className="fixed top-20 right-6 z-[9999] pointer-events-none flex flex-col gap-3">
        {activityFeed.filter(item => item.type === 'ALERT').slice(0, 3).map((alert, idx) => (
          <div key={idx} className="bg-[#ff4b2b]/20 backdrop-blur-md border border-[#ff4b2b]/40 text-white px-5 py-4 rounded-xl shadow-2xl pointer-events-auto flex items-center gap-3">
            <AlertTriangle className="text-[#ff4b2b]" size={20} />
            <span className="text-sm font-bold">{alert.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm font-medium ${active ? 'bg-[#00d2ff]/10 text-[#00d2ff] border-l-[3px] border-[#00d2ff]' : 'text-[#a0a0a0] hover:bg-white/5 hover:text-white'}`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${active ? 'text-[#00d2ff] border-b-2 border-[#00d2ff]' : 'text-gray-500 hover:text-white'}`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</span>
      <span className="text-xl font-black text-white">{value}</span>
    </div>
  );
}
