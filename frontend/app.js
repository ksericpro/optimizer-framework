const API_BASE = 'http://localhost:8000';
let map, markers = [], driverMarkers = {}, polylines = [], pendingMarkers = [];
let socket, isAddOrderMode = false;
let allVehicles = []; // Store for dropdowns
let currentRouteData = [];
let charts = {};

async function init() {
    initMap();
    initSocket();
    await loadInitialData(true);
    setupEventListeners();
    setupTabs();
    setupNavigation();
    initSearch();

    // Slow refresh for routes/orders (every 60s)
    setInterval(loadInitialData, 60000);
}

function initSocket() {
    socket = io(API_BASE, {
        path: '/ws/socket.io'
    });

    socket.on('connect', () => {
        console.log('Connected to real-time server');
        updateActivityFeed('SYSTEM', 'Real-time tracking activated.');
    });

    socket.on('location_update', (data) => {
        handleLocationUpdate(data);
    });

    socket.on('disconnect', () => {
        console.warn('Disconnected from real-time server');
        updateActivityFeed('SYSTEM', 'Real-time tracking lost. Check connection.');
    });

    socket.on('alert', (data) => {
        console.warn('SYSTEM ALERT:', data);
        displayAlert(data);
        updateActivityFeed('ALERT', data.message);
    });

    socket.on('fleet_update', (data) => {
        console.log('Fleet Update Received:', data);
        fetchFleet(); // Trigger UI Refresh
    });
}

function displayAlert(data) {
    const container = document.getElementById('alert-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'alert-toast';
    toast.innerHTML = `
        <div class="toast-icon">⚠️</div>
        <div class="toast-msg">${data.message}</div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}

function handleLocationUpdate(data) {
    const { driver_id, full_name, lat, lng } = data;
    const latlng = [lat, lng];

    if (driverMarkers[driver_id]) {
        // Update position smoothly
        driverMarkers[driver_id].setLatLng(latlng);
    } else {
        // Create new marker if it doesn't exist
        const truckIcon = L.divIcon({
            className: 'truck-marker',
            html: `<div class="truck-icon" style="background-color: #1a1c2c;">🚚</div>`,
            iconSize: [30, 30]
        });

        driverMarkers[driver_id] = L.marker(latlng, { icon: truckIcon })
            .bindTooltip(full_name || `Driver ${driver_id}`, { permanent: false, direction: 'top' })
            .addTo(map);
    }
}

function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([1.3521, 103.8198], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

async function loadInitialData(isFirstLoad = false) {
    try {
        const response = await fetch(`${API_BASE}/`);
        if (!response.ok) throw new Error('API unreachable');

        if (isFirstLoad) {
            updateActivityFeed('SYSTEM', 'Dashboard connected to background services.');
        }

        renderDriversList();
        await visualizeRoutes();
        await loadPendingOrders();
        await updateDriverPositions();

    } catch (err) {
        console.error(err);
        updateActivityFeed('ERROR', 'Failed to sync with API.');
    }
}

async function loadPendingOrders() {
    try {
        const res = await fetch(`${API_BASE}/orders?status=PENDING`);
        const orders = await res.json();

        // Clear old pending markers
        pendingMarkers.forEach(m => map.removeLayer(m));
        pendingMarkers = [];

        const list = document.getElementById('pending-list');
        list.innerHTML = '';
        document.getElementById('pending-count').innerText = orders.length;

        orders.forEach(order => {
            // Add to list
            const card = document.createElement('div');
            card.className = 'pending-order-card';
            card.innerHTML = `
                <div class="po-address">${order.delivery_address}</div>
                <div class="po-meta">ID: ${order.id.substring(0, 8)} | Priority: ${order.priority}</div>
            `;
            card.onclick = () => openOrderEditor(order);
            list.appendChild(card);

            // Add to map
            const marker = L.circleMarker([order.lat, order.lng], {
                radius: 6,
                fillColor: '#ffd700',
                color: "#fff",
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.8
            }).addTo(map);

            marker.on('click', () => openOrderEditor(order));
            pendingMarkers.push(marker);
        });
    } catch (e) {
        console.error("Failed to load pending orders", e);
    }
}

async function visualizeRoutes() {
    // Clear existing stop markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Clear polylines
    polylines.forEach(p => map.removeLayer(p));
    polylines = [];

    const colors = ['#00d2ff', '#9d50bb', '#ff0088'];
    const statusColors = {
        'PENDING': '#ffd700',
        'ASSIGNED': '#00d2ff',
        'DELIVERED': '#00ff88',
        'FAILED': '#ff4b2b'
    };

    let totalStops = 0;
    let completedStops = 0;

    try {
        const res = await fetch(`${API_BASE}/routes/today`);
        const allRoutes = await res.json();
        currentRouteData = allRoutes; // Store for timeline lookup

        allRoutes.forEach((route, i) => {
            if (route.stops && route.stops.length > 0) {
                const routeCoords = [[1.3521, 103.8198]];

                route.stops.forEach(stop => {
                    totalStops++;
                    if (stop.stop_status === 'DELIVERED') completedStops++;

                    const latlng = [stop.lat, stop.lng];
                    routeCoords.push(latlng);

                    const color = stop.stop_status === 'DELIVERED' ? statusColors['DELIVERED'] : colors[i % colors.length];
                    const marker = L.circleMarker(latlng, {
                        radius: 8,
                        fillColor: color,
                        color: "#fff",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    }).bindPopup(`
                        <div class="popup-content">
                            <b>Order #${stop.stop_id.substring(0, 8)}</b><br>
                            Status: <span class="status-tag ${stop.stop_status.toLowerCase()}">${stop.stop_status}</span><br>
                            ${stop.delivery_address}<br>
                            ETA: ${new Date(stop.estimated_arrival_time).toLocaleTimeString()}
                        </div>
                    `).addTo(map);

                    markers.push(marker);
                });

                const poly = L.polyline(routeCoords, {
                    color: colors[i % colors.length],
                    weight: 3,
                    opacity: 0.5,
                    dashArray: '5, 10'
                }).addTo(map);
                polylines.push(poly);
            }
        });

        const activeRoutesEl = document.getElementById('active-routes-count');
        if (activeRoutesEl) activeRoutesEl.innerText = allRoutes.length;
    } catch (e) {
        console.error("Failed to load routes", e);
    }

    const totalOrdersEl = document.getElementById('total-orders');
    if (totalOrdersEl) totalOrdersEl.innerText = totalStops;
    const rate = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
    const rateEl = document.getElementById('efficiency-score');
    if (rateEl) rateEl.innerText = `${rate}%`;
}

async function updateDriverPositions() {
    try {
        const res = await fetch(`${API_BASE}/drivers/locations`);
        const drivers = await res.json();

        drivers.forEach(driver => {
            if (!driver.last_known_lat || !driver.last_known_lng) return;
            handleLocationUpdate({
                driver_id: driver.id,
                lat: driver.last_known_lat,
                lng: driver.last_known_lng,
                full_name: driver.full_name
            });
        });
    } catch (e) {
        console.error("Failed to fetch driver locations", e);
    }
}

async function renderDriversList() {
    const list = document.getElementById('driver-list');
    try {
        const res = await fetch(`${API_BASE}/drivers/locations`);
        const drivers = await res.json();

        list.innerHTML = '';
        drivers.forEach(driver => {
            const card = document.createElement('div');
            card.className = 'driver-mini-card';
            card.innerHTML = `
                <div class="driver-header">
                    <div class="status-dot"></div>
                    <b>${driver.full_name}</b>
                </div>
                <div class="activity-content">Live Tracking Active</div>
            `;
            card.onclick = () => {
                // Remove active class from all
                document.querySelectorAll('.driver-mini-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                if (document.getElementById('analytics-view').style.display !== 'none') {
                    fetchDriverAnalytics(driver.id, driver.full_name);
                } else {
                    showDriverSchedule(driver.id, driver.full_name);
                }
            };
            list.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to render driver list", e);
    }
}

function showDriverSchedule(driverId, fullName) {
    // Switch to schedule tab
    switchTab('schedule');

    document.getElementById('schedule-driver-name').innerText = fullName;
    const timeline = document.getElementById('schedule-timeline');
    timeline.innerHTML = '';

    const route = currentRouteData.find(r => r.driver_id == driverId);
    if (!route || !route.stops || route.stops.length === 0) {
        timeline.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">No stops assigned today.</div>';
        return;
    }

    route.stops.forEach(stop => {
        const item = document.createElement('div');
        item.className = `timeline-item ${stop.stop_status.toLowerCase()}`;
        const podHtml = stop.pod_photo_url || stop.pod_signature ? `
            <div class="pod-info" style="margin-top: 10px; border-top: 1px solid var(--glass-border); padding-top: 10px;">
                <span style="font-size: 0.7rem; color: var(--delivered);">✓ Proof of Delivery attached</span>
                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    ${stop.pod_photo_url ? `<a href="${API_BASE}${stop.pod_photo_url}" target="_blank" style="font-size: 0.7rem; color: var(--accent-blue);">View Photo</a>` : ''}
                    ${stop.pod_signature ? `<a href="#" onclick="viewSignature('${stop.pod_signature}'); return false;" style="font-size: 0.7rem; color: var(--accent-blue);">View Signature</a>` : ''}
                </div>
            </div>` : '';

        item.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-time">${new Date(stop.estimated_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                <div class="timeline-address">${stop.delivery_address}</div>
                <div class="timeline-id">Order #${stop.stop_id.substring(0, 8)} | ${stop.stop_status}</div>
                ${podHtml}
            </div>
        `;
        timeline.appendChild(item);
    });
}

function switchTab(tabId) {
    const tabs = ['activity', 'pending', 'schedule'];
    tabs.forEach(x => {
        document.getElementById(`tab-${x}`).classList.remove('active');
        document.getElementById(`${x}-pane`).classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`${tabId}-pane`).classList.add('active');
}

function updateActivityFeed(user, msg) {
    const feed = document.getElementById('activity-list');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
        <div class="activity-content"><b>[${user}]</b> ${msg}</div>
        <div class="activity-time">${new Date().toLocaleTimeString()}</div>
    `;
    feed.prepend(item);
}

function setupEventListeners() {
    const btn = document.getElementById('optimize-btn');
    if (btn) {
        btn.onclick = async () => {
            btn.disabled = true;
            btn.innerHTML = '⌛ Optimizing...';
            updateActivityFeed('USER', 'Triggered full optimization cycle.');
            try {
                const res = await fetch(`${API_BASE}/optimize`, { method: 'POST' });
                const data = await res.json();
                updateActivityFeed('AI', `Optimization complete. Assigned ${data.optimizer.orders_assigned || 0} orders.`);
                await loadInitialData();
            } catch (err) {
                updateActivityFeed('ERROR', 'Optimization failed.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '⚡ Run Optimizer';
            }
        };
    }

    const downloadBtn = document.getElementById('download-report-btn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            window.open(`${API_BASE}/reports/daily`, '_blank');
        };
    }

    const addBtn = document.getElementById('add-order-btn');
    addBtn.onclick = () => {
        isAddOrderMode = !isAddOrderMode;
        addBtn.classList.toggle('btn-primary');
        addBtn.classList.toggle('btn-secondary');
        addBtn.innerHTML = isAddOrderMode ? '📍 Click Map to Add' : '<span class="icon">➕</span> Add Order';
        document.getElementById('map').style.cursor = isAddOrderMode ? 'crosshair' : '';
    };

    map.on('click', (e) => {
        if (isAddOrderMode) {
            openOrderEditor({ lat: e.latlng.lat, lng: e.latlng.lng, delivery_address: '', id: null });
        }
    });

    document.getElementById('close-editor').onclick = closeOrderEditor;
    document.getElementById('save-order').onclick = saveOrder;
    document.getElementById('delete-order').onclick = deleteOrder;

    initSearch();
}

function initSearch() {
    const input = document.getElementById('edit-address');
    const dropdown = document.getElementById('search-suggestions');
    let timeout = null;

    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const query = input.value;
        if (query.length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        timeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeometries=Y&getAddrDetails=Y`);
                const data = await res.json();

                if (data.results && data.results.length > 0) {
                    dropdown.innerHTML = '';
                    data.results.slice(0, 5).forEach(res => {
                        const item = document.createElement('div');
                        item.className = 'suggestion-item';
                        item.innerHTML = `
                            <span class="postal">${res.POSTAL || 'N/A'}</span>
                            <span class="addr">${res.ADDRESS}</span>
                        `;
                        item.onclick = () => {
                            input.value = res.ADDRESS;
                            document.getElementById('edit-lat').value = res.LATITUDE;
                            document.getElementById('edit-lng').value = res.LONGITUDE;
                            dropdown.style.display = 'none';

                            // Move map and add temporary marker
                            const latlng = [parseFloat(res.LATITUDE), parseFloat(res.LONGITUDE)];
                            map.setView(latlng, 16);
                        };
                        dropdown.appendChild(item);
                    });
                    dropdown.style.display = 'block';
                } else {
                    dropdown.style.display = 'none';
                }
            } catch (e) {
                console.error("Search failed", e);
            }
        }, 300);
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function setupTabs() {
    ['activity', 'pending', 'schedule'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.onclick = () => switchTab(t);
    });
}

function setupNavigation() {
    document.getElementById('nav-dashboard').onclick = () => {
        showView('dashboard');
    };
    document.getElementById('nav-analytics').onclick = () => {
        showView('analytics');
        fetchAnalytics();
    };
    document.getElementById('nav-fleet').onclick = () => {
        showView('fleet');
        fetchFleet();
    };
    document.getElementById('nav-vehicles').onclick = () => {
        showView('vehicles');
        fetchFleet(); // Uses the same data source
    };
    document.getElementById('nav-drivers').onclick = () => {
        showView('drivers');
        fetchFleet();
    };
}

function showView(viewId) {
    // Update Nav UI
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`nav-${viewId}`).classList.add('active');

    // Swap Views
    document.getElementById('dashboard-view').style.display = viewId === 'dashboard' ? 'block' : 'none';
    document.getElementById('analytics-view').style.display = viewId === 'analytics' ? 'block' : 'none';
    document.getElementById('fleet-view').style.display = viewId === 'fleet' ? 'block' : 'none';
    document.getElementById('vehicle-view').style.display = viewId === 'vehicles' ? 'block' : 'none';
    document.getElementById('driver-manager-view').style.display = viewId === 'drivers' ? 'block' : 'none';
}

async function fetchAnalytics() {
    try {
        const res = await fetch(`${API_BASE}/analytics/summary`);
        const data = await res.json();
        renderCharts(data, 'System Summary');
    } catch (e) {
        console.error("Failed to load analytics", e);
    }
}

async function fetchDriverAnalytics(driverId, fullName) {
    try {
        const res = await fetch(`${API_BASE}/analytics/drivers/${driverId}`);
        const data = await res.json();
        renderCharts(data, `Performance: ${fullName}`);
    } catch (e) {
        console.error("Failed to load driver analytics", e);
    }
}

function renderCharts(data, title) {
    const labels = data.map(d => new Date(d.date).toLocaleDateString());
    const completed = data.map(d => d.total_completed || d.total_orders_completed);
    const serviceTimes = data.map(d => d.avg_service_time || d.average_service_time);
    const efficiency = data.map(d => d.avg_efficiency || d.efficiency_score);

    updateChart('completed-orders-chart', 'Orders', labels, completed, '#00d2ff');
    updateChart('service-time-chart', 'Minutes', labels, serviceTimes, '#9d50bb');
    updateChart('efficiency-chart', 'Score', labels, efficiency, '#00ff88');
}

function updateChart(id, label, labels, values, color) {
    if (charts[id]) {
        charts[id].destroy();
    }

    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: values,
                borderColor: color,
                backgroundColor: color + '22',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0a0a0' }
                }
            }
        }
    });
}

function openOrderEditor(order) {
    document.getElementById('edit-order-id').value = order.id || '';
    document.getElementById('edit-address').value = order.delivery_address || '';
    document.getElementById('edit-lat').value = order.lat || '';
    document.getElementById('edit-lng').value = order.lng || '';
    document.getElementById('edit-contact-person').value = order.contact_person || '';
    document.getElementById('edit-contact-mobile').value = order.contact_mobile || '';

    document.getElementById('delete-order').style.display = order.id ? 'block' : 'none';
    document.getElementById('save-order').innerText = order.id ? 'Save Changes' : 'Create Order';

    document.getElementById('order-editor').classList.add('active');
}

function closeOrderEditor() {
    document.getElementById('order-editor').classList.remove('active');
    isAddOrderMode = false;
    const addBtn = document.getElementById('add-order-btn');
    addBtn.classList.remove('btn-primary');
    addBtn.classList.add('btn-secondary');
    addBtn.innerHTML = '<span class="icon">➕</span> Add Order';
    document.getElementById('map').style.cursor = '';
}

async function saveOrder() {
    const id = document.getElementById('edit-order-id').value;
    const address = document.getElementById('edit-address').value;
    const lat = document.getElementById('edit-lat').value;
    const lng = document.getElementById('edit-lng').value;
    const person = document.getElementById('edit-contact-person').value;
    const mobile = document.getElementById('edit-contact-mobile').value;

    const baseParams = `delivery_address=${encodeURIComponent(address)}&lat=${lat}&lng=${lng}&contact_person=${encodeURIComponent(person)}&contact_mobile=${encodeURIComponent(mobile)}`;

    const url = id
        ? `${API_BASE}/orders/${id}?${baseParams}`
        : `${API_BASE}/orders?${baseParams}`;

    const method = id ? 'PATCH' : 'POST';

    try {
        const res = await fetch(url, { method });
        if (res.ok) {
            updateActivityFeed('SYSTEM', `Order ${id ? 'updated' : 'created'} successfully.`);
            closeOrderEditor();
            await loadInitialData();
        } else {
            alert('Failed to save order');
        }
    } catch (e) {
        console.error(e);
    }
}

async function deleteOrder() {
    const id = document.getElementById('edit-order-id').value;
    if (!id || !confirm('Are you sure you want to delete this order?')) return;

    try {
        const res = await fetch(`${API_BASE}/orders/${id}`, { method: 'DELETE' });
        if (res.ok) {
            updateActivityFeed('SYSTEM', 'Order deleted.');
            closeOrderEditor();
            await loadInitialData();
        } else {
            const err = await res.json();
            alert(err.detail || 'Failed to delete order');
        }
    } catch (e) {
        console.error(e);
    }
}

async function fetchFleet() {
    const fleetList = document.getElementById('fleet-list');
    const vehicleList = document.getElementById('vehicle-list');
    const driverList = document.getElementById('driver-manager-list');

    if (!fleetList || !vehicleList || !driverList) {
        console.error("Fleet UI elements missing from DOM");
        return;
    }

    try {
        console.log("Fetching fleet data...");
        const res = await fetch(`${API_BASE}/fleet`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();
        console.log("Fleet data received:", data);

        allVehicles = data.vehicles || [];
        const drivers = data.drivers || [];

        fleetList.innerHTML = '';
        vehicleList.innerHTML = '';
        driverList.innerHTML = '';

        // 1. Render Management: Vehicles
        allVehicles.forEach(v => {
            try {
                const lastSeenStr = v.last_activity ? formatDate(v.last_activity) : 'Never';
                const card = document.createElement('div');
                card.className = 'driver-mini-card';
                card.style.cursor = 'pointer';
                card.onclick = () => openVehicleEditor(v);
                card.innerHTML = `
                    <div class="driver-header">
                        <div class="status-dot" style="background: ${v.last_activity ? 'var(--delivered)' : '#666'}"></div>
                        <b>${v.plate_number}</b>
                    </div>
                    <div class="activity-content">
                        <div>Type: ${v.type} | Cap: ${v.capacity_weight}kg</div>
                        <div style="font-size: 0.7rem; color: #aaa; margin-top: 4px;">Last Activity: ${lastSeenStr}</div>
                    </div>
                `;
                vehicleList.appendChild(card);
            } catch (err) { console.error("Error rendering vehicle card", err, v); }
        });

        // 2. Render Management: Drivers
        drivers.forEach(d => {
            try {
                const card = document.createElement('div');
                card.className = 'driver-mini-card';
                card.style.cursor = 'pointer';
                card.onclick = () => openDriverEditor(d);
                card.innerHTML = `
                    <div class="driver-header">
                        <div class="status-dot" style="background: ${d.is_active ? 'var(--delivered)' : 'var(--failed)'}"></div>
                        <b>${d.full_name}</b>
                    </div>
                    <div class="activity-content">
                        <div>Status: ${d.is_active ? 'Active' : 'Offline/Disabled'}</div>
                        <div style="font-size: 0.75rem; color: #fff; margin: 2px 0;">📞 ${d.contact_number || 'No Contact Info'}</div>
                        <div style="color: var(--accent-blue); font-size: 0.75rem;">Assigned: ${d.assigned_vehicle || 'NONE'}</div>
                    </div>
                `;
                driverList.appendChild(card);
            } catch (err) { console.error("Error rendering driver manager card", err, d); }
        });

        // 3. Render Fleet Overview (Assignments & Shifting)
        drivers.forEach(d => {
            try {
                const isOnline = d.last_seen && (new Date() - new Date(d.last_seen)) < (5 * 60 * 1000);
                const card = document.createElement('div');
                card.className = 'driver-mini-card';
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    if (e.target.tagName !== 'BUTTON') openDriverEditor(d);
                };
                card.innerHTML = `
                    <div class="driver-header" style="justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="status-dot" style="background: ${isOnline ? 'var(--delivered)' : '#666'}; box-shadow: ${isOnline ? '0 0 8px var(--delivered)' : 'none'};"></div>
                            <div>
                                <b style="display: block;">${d.full_name}</b>
                                <small style="color: var(--accent-blue);">${d.assigned_vehicle || 'No Vehicle'}</small>
                            </div>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.6rem;" onclick="checkIn('${d.id}')">Start Shift</button>
                            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.6rem;" onclick="checkOut('${d.id}')">End Shift</button>
                        </div>
                    </div>
                    <div class="activity-content" style="margin-top: 5px; display: flex; justify-content: space-between; align-items: center;">
                        <div>Live Status: <b>${isOnline ? 'ONLINE' : 'OFFLINE'}</b></div>
                        <div style="font-size: 0.75rem; color: #fff;">📞 ${d.contact_number || '-'}</div>
                    </div>
                `;
                fleetList.appendChild(card);
            } catch (err) { console.error("Error rendering fleet card", err, d); }
        });

    } catch (e) {
        console.error("Critical failure in fetchFleet", e);
    }
}

async function checkIn(driverId) {
    try {
        const res = await fetch(`${API_BASE}/drivers/${driverId}/check-in`, { method: 'POST' });
        const data = await res.json();
        console.log(data.message);
        fetchFleet();
    } catch (e) {
        console.error("Failed to check-in", e);
    }
}

async function checkOut(driverId) {
    try {
        await fetch(`${API_BASE}/drivers/${driverId}/check-out`, { method: 'POST' });
        fetchFleet();
    } catch (e) {
        console.error("Failed to check-out", e);
    }
}

// --- Vehicle Editor ---
function openVehicleEditor(v = null) {
    const overlay = document.getElementById('vehicle-editor');
    const title = overlay.querySelector('h3');
    if (v) {
        title.innerText = 'Edit Vehicle';
        document.getElementById('edit-vehicle-id').value = v.id;
        document.getElementById('edit-plate').value = v.plate_number;
        document.getElementById('edit-vtype').value = v.type;
        document.getElementById('edit-vcap').value = v.capacity_weight;
    } else {
        title.innerText = 'Add Vehicle';
        document.getElementById('edit-vehicle-id').value = '';
        document.getElementById('edit-plate').value = '';
        document.getElementById('edit-vtype').value = 'VAN';
        document.getElementById('edit-vcap').value = '500';
    }
    overlay.classList.add('active');
}

function closeVehicleEditor() {
    document.getElementById('vehicle-editor').classList.remove('active');
}

async function saveVehicle() {
    const id = document.getElementById('edit-vehicle-id').value;
    const plate = document.getElementById('edit-plate').value;
    const vtype = document.getElementById('edit-vtype').value;
    const cap = document.getElementById('edit-vcap').value;

    const url = id ? `${API_BASE}/vehicles/${id}` : `${API_BASE}/vehicles?plate_number=${plate}&type=${vtype}&capacity_weight=${cap}`;
    const method = id ? 'PATCH' : 'POST';

    try {
        const body = id ? JSON.stringify({ plate_number: plate, type: vtype, capacity_weight: parseFloat(cap) }) : null;
        await fetch(url, {
            method,
            headers: id ? { 'Content-Type': 'application/json' } : {}
        });
        closeVehicleEditor();
        fetchFleet();
    } catch (e) {
        console.error(e);
    }
}

async function deleteVehicle() {
    const id = document.getElementById('edit-vehicle-id').value;
    if (!id || !confirm('Delete this vehicle?')) return;
    try {
        await fetch(`${API_BASE}/vehicles/${id}`, { method: 'DELETE' });
        closeVehicleEditor();
        fetchFleet();
    } catch (e) {
        console.error(e);
    }
}

// --- Driver Editor ---
function openDriverEditor(d = null) {
    const overlay = document.getElementById('driver-editor');
    const title = overlay.querySelector('h3');
    const creds = document.getElementById('driver-creds');

    // Fill Vehicle Dropdown
    const select = document.getElementById('edit-dvehicle');
    select.innerHTML = '<option value="">None</option>';
    allVehicles.forEach(v => {
        select.innerHTML += `<option value="${v.id}">${v.plate_number}</option>`;
    });

    if (d) {
        title.innerText = 'Edit Driver';
        document.getElementById('edit-driver-id').value = d.id;
        document.getElementById('edit-dname').value = d.full_name;
        document.getElementById('edit-dphone').value = d.contact_number || '';
        document.getElementById('edit-dvehicle').value = allVehicles.find(v => v.plate_number === d.assigned_vehicle)?.id || '';
        creds.style.display = 'none'; // Hide credentials for edit
    } else {
        title.innerText = 'Add Driver';
        document.getElementById('edit-driver-id').value = '';
        document.getElementById('edit-dname').value = '';
        document.getElementById('edit-dphone').value = '';
        document.getElementById('edit-duser').value = '';
        document.getElementById('edit-dpwd').value = '';
        document.getElementById('edit-dvehicle').value = '';
        creds.style.display = 'block';
    }
    overlay.classList.add('active');
}

function closeDriverEditor() {
    document.getElementById('driver-editor').classList.remove('active');
}

async function saveDriver() {
    const id = document.getElementById('edit-driver-id').value;
    const name = document.getElementById('edit-dname').value;
    const phone = document.getElementById('edit-dphone').value;
    const vid = document.getElementById('edit-dvehicle').value;

    if (id) {
        // Update
        await fetch(`${API_BASE}/drivers/${id}?full_name=${encodeURIComponent(name)}&contact_number=${encodeURIComponent(phone)}&assigned_vehicle_id=${vid || ''}`, { method: 'PATCH' });
    } else {
        // Create
        const user = document.getElementById('edit-duser').value;
        const pwd = document.getElementById('edit-dpwd').value;
        await fetch(`${API_BASE}/drivers?full_name=${encodeURIComponent(name)}&username=${user}&password=${pwd}&contact_number=${encodeURIComponent(phone)}&assigned_vehicle_id=${vid || ''}`, { method: 'POST' });
    }
    closeDriverEditor();
    fetchFleet();
}

async function deleteDriver() {
    const id = document.getElementById('edit-driver-id').value;
    if (!id || !confirm('Delete this driver?')) return;
    try {
        await fetch(`${API_BASE}/drivers/${id}`, { method: 'DELETE' });
        closeDriverEditor();
        fetchFleet();
    } catch (e) {
        console.error(e);
    }
}


document.addEventListener('DOMContentLoaded', init);

function viewSignature(dataUrl) {
    const win = window.open();
    win.document.write(`<img src="${dataUrl}" style="border:1px solid #ccc; background: white;">`);
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-SG', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}
