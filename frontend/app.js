const API_BASE = 'http://localhost:8000';
let map, markers = [], driverMarkers = {}, polylines = [];

async function init() {
    initMap();
    await loadInitialData(true);
    setupEventListeners();

    // Fast refresh for blips (every 2s)
    setInterval(updateDriverPositions, 2000);
    // Slow refresh for routes (every 20s)
    setInterval(loadInitialData, 20000);
}

function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([40.7128, -74.0060], 12);

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
        await updateDriverPositions();

    } catch (err) {
        console.error(err);
        updateActivityFeed('ERROR', 'Failed to sync with API.');
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

        allRoutes.forEach((route, i) => {
            if (route.stops && route.stops.length > 0) {
                const routeCoords = [[40.7128, -74.0060]];

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

        document.getElementById('active-routes-count').innerText = allRoutes.length;
    } catch (e) {
        console.error("Failed to load routes", e);
    }

    document.getElementById('total-orders-count').innerText = totalStops;
    const rate = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
    const rateEl = document.querySelector('.stat-card:nth-child(3) .value');
    if (rateEl) rateEl.innerText = `${rate}%`;
}

async function updateDriverPositions() {
    try {
        const res = await fetch(`${API_BASE}/drivers/locations`);
        const drivers = await res.json();

        drivers.forEach(driver => {
            if (!driver.last_known_lat || !driver.last_known_lng) return;

            const latlng = [driver.last_known_lat, driver.last_known_lng];

            if (driverMarkers[driver.id]) {
                // Update position smoothly
                driverMarkers[driver.id].setLatLng(latlng);
            } else {
                // Create new marker (Truck Icon)
                const truckIcon = L.divIcon({
                    className: 'truck-marker',
                    html: `<div class="truck-icon" style="background-color: #1a1c2c;">🚚</div>`,
                    iconSize: [30, 30]
                });

                driverMarkers[driver.id] = L.marker(latlng, { icon: truckIcon })
                    .bindTooltip(driver.full_name, { permanent: false, direction: 'top' })
                    .addTo(map);
            }
        });
    } catch (e) {
        console.error("Failed to fetch driver locations", e);
    }
}

function renderDriversList() {
    const list = document.getElementById('driver-list');
    list.innerHTML = `
        <div class="driver-mini-card">
            <div class="driver-header"><div class="status-dot"></div><b>John Doe</b></div>
            <div class="activity-content">Status: Active</div>
        </div>
        <div class="driver-mini-card">
            <div class="driver-header"><div class="status-dot"></div><b>Jane Smith</b></div>
            <div class="activity-content">Status: Active</div>
        </div>
        <div class="driver-mini-card">
            <div class="driver-header"><div class="status-dot"></div><b>Bob Wilson</b></div>
            <div class="activity-content">Status: Active</div>
        </div>
    `;
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
                updateActivityFeed('AI', `Optimization complete. Assigned ${data.optimizer.orders_assigned} orders.`);
                await loadInitialData();
            } catch (err) {
                updateActivityFeed('ERROR', 'Optimization failed.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '⚡ Run Optimizer';
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', init);
