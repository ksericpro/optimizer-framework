const API_BASE = 'http://localhost:8000';

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('driver-app-content');
const loginForm = document.getElementById('login-form');
const stopsList = document.getElementById('stops-list');
let currentStopId = null;
let signaturePad, canvas, ctx;
let isDrawing = false;

// 1. Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const driverId = localStorage.getItem('driver_id');

    if (token && driverId) {
        showApp(driverId);
    }
    initSignaturePad();
    setupPodListeners();
});

function initSignaturePad() {
    canvas = document.getElementById('signature-pad');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    };
    window.addEventListener('resize', resize);
    resize();

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || e.touches[0].clientX) - rect.left,
            y: (e.clientY || e.touches[0].clientY) - rect.top
        };
    };

    const start = (e) => {
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stop = () => isDrawing = false;

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);

    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', move);
    canvas.addEventListener('touchend', stop);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
}

function setupPodListeners() {
    document.getElementById('pod-photo').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                const img = document.getElementById('photo-preview');
                img.src = re.target.result;
                img.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    };

    document.getElementById('submit-pod-btn').onclick = savePod;
}

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
    appContent.style.display = 'flex';

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
        const status = stop.stop_status;
        const isDone = status === 'DELIVERED' || status === 'FAILED' || status === 'CANCELLED';
        const isFailed = status === 'FAILED';

        const card = document.createElement('div');
        card.className = `stop-card ${status.toLowerCase()}`;
        card.innerHTML = `
            <div class="stop-number">STOP # ${stop.sequence_number}</div>
            <div class="stop-address">${stop.delivery_address}</div>
            <div class="stop-meta">ETA: ${new Date(stop.estimated_arrival_time).toLocaleTimeString()}</div>
            
            <div class="contact-info">
                <div>👤 <b>${stop.contact_person || 'No Contact Person'}</b></div>
                <div>📱 <b>${stop.contact_mobile || 'No Mobile'}</b></div>
            </div>

            ${isFailed ? `<div style="color: var(--failed); font-size: 0.75rem; margin-top: 5px;">⚠️ Failed: ${stop.fail_reason || 'No reason provided'}</div>` : ''}

            <button class="action-btn ${isDone ? 'done' : ''}" 
                    onclick="openPodModal('${stop.stop_id}')" 
                    ${isDone ? 'disabled' : ''}>
                ${isDone ? `✓ ${status}` : 'MARK AS DELIVERED / FAIL'}
            </button>
        `;
        stopsList.appendChild(card);
    });
}

// 4. Update Status
async function updateStatus(stopId) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/stops/${stopId}/status?status=DELIVERED`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok;
    } catch (err) {
        console.error(err);
        return false;
    }
}

function openPodModal(stopId) {
    currentStopId = stopId;
    document.getElementById('pod-modal').classList.add('active');
    clearSignature();
    document.getElementById('pod-photo').value = '';
    document.getElementById('photo-preview').style.display = 'none';
}

function closePod() {
    document.getElementById('pod-modal').classList.remove('active');
}

function clearSignature() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function savePod() {
    const btn = document.getElementById('submit-pod-btn');
    const token = localStorage.getItem('token');
    const photoFile = document.getElementById('pod-photo').files[0];
    const signatureBase64 = canvas.toDataURL(); // Empty canvas if not drawn

    btn.disabled = true;
    btn.innerText = 'Uploading Proof...';

    try {
        // 1. Upload POD
        const formData = new FormData();
        if (photoFile) formData.append('photo', photoFile);
        formData.append('signature', signatureBase64);

        const podRes = await fetch(`${API_BASE}/stops/${currentStopId}/pod`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (podRes.ok) {
            // 2. Mark as delivered
            const success = await updateStatus(currentStopId);
            if (success) {
                closePod();
                loadDriverRoute(localStorage.getItem('driver_id'));
            } else {
                alert('POD saved but failed to update status.');
            }
        } else {
            alert('Failed to save POD.');
        }
    } catch (err) {
        console.error(err);
        alert('Network error while saving POD.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Complete Delivery';
    }
}

function openFailModal() {
    closePod();
    document.getElementById('fail-modal').classList.add('active');
    document.getElementById('fail-reason').value = '';
}

function closeFailModal() {
    document.getElementById('fail-modal').classList.remove('active');
}

async function saveFailure() {
    const btn = document.getElementById('submit-fail-btn');
    const reason = document.getElementById('fail-reason').value;
    const token = localStorage.getItem('token');

    if (!reason) {
        alert("Please provide a reason for the failure.");
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Submitting...';

    try {
        const res = await fetch(`${API_BASE}/stops/${currentStopId}/status?status=FAILED&reason=${encodeURIComponent(reason)}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            closeFailModal();
            loadDriverRoute(localStorage.getItem('driver_id'));
        } else {
            alert('Failed to update status.');
        }
    } catch (err) {
        console.error(err);
        alert('Network error while reporting failure.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Failure Report';
    }
}

// 5. Logout
document.getElementById('logout-btn').addEventListener('click', logout);

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('driver_id');
    location.reload();
}
