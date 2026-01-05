const API_BASE = 'http://localhost:8000';

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('driver-app-content');
const loginForm = document.getElementById('login-form');
const stopsList = document.getElementById('stops-list');

// 1. Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const driverId = localStorage.getItem('driver_id');

    if (token && driverId) {
        showApp(driverId);
    }
});

// 2. Handle Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    errorEl.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('driver_id', data.driver_id);
            showApp(data.driver_id);
        } else {
            errorEl.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
        alert('Network error during login');
    }
});

function showApp(driverId) {
    loginScreen.style.display = 'none';
    appContent.style.display = 'block';

    // Set a friendly name
    const usernames = { 'john': 'John Doe', 'jane': 'Jane Smith', 'bob': 'Bob Wilson' };
    const storedUsername = document.getElementById('username').value || 'Driver';
    document.getElementById('driver-name-display').innerText = usernames[storedUsername] || 'Driver';

    loadDriverRoute(driverId);
}

// 3. Load Routes
async function loadDriverRoute(driverId) {
    const token = localStorage.getItem('token');
    stopsList.innerHTML = '<div style="text-align:center; padding: 40px;"><div class="loading-spinner"></div></div>';

    try {
        const res = await fetch(`${API_BASE}/drivers/${driverId}/route`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            logout();
            return;
        }

        const data = await res.json();
        renderStops(data.stops);
    } catch (err) {
        stopsList.innerHTML = '<div style="text-align: center; color: var(--failed); padding: 40px;">Error loading route.</div>';
    }
}

function renderStops(stops) {
    if (!stops || stops.length === 0) {
        stopsList.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px;">No deliveries assigned for you today.</div>';
        return;
    }

    stopsList.innerHTML = '';
    stops.forEach(stop => {
        const isDelivered = stop.stop_status === 'DELIVERED';
        const card = document.createElement('div');
        card.className = `stop-card ${isDelivered ? 'delivered' : ''}`;
        card.innerHTML = `
            <div class="stop-number">STOP # ${stop.sequence_number}</div>
            <div class="stop-address">${stop.delivery_address}</div>
            <div class="stop-meta">ETA: ${new Date(stop.estimated_arrival_time).toLocaleTimeString()}</div>
            <button class="action-btn ${isDelivered ? 'done' : ''}" 
                    onclick="updateStatus('${stop.stop_id}', this)" 
                    ${isDelivered ? 'disabled' : ''}>
                ${isDelivered ? '✓ DELIVERED' : 'MARK AS DELIVERED'}
            </button>
        `;
        stopsList.appendChild(card);
    });
}

// 4. Update Status
async function updateStatus(stopId, btn) {
    const token = localStorage.getItem('token');
    btn.disabled = true;
    btn.innerText = 'Updating...';

    try {
        const res = await fetch(`${API_BASE}/stops/${stopId}/status?status=DELIVERED`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            btn.closest('.stop-card').classList.add('delivered');
            btn.classList.add('done');
            btn.innerText = '✓ DELIVERED';
        } else {
            btn.disabled = false;
            btn.innerText = 'Error! Try Again';
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Network Error';
    }
}

// 5. Logout
document.getElementById('logout-btn').addEventListener('click', logout);

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('driver_id');
    location.reload();
}
