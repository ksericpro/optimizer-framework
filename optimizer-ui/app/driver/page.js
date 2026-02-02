'use client';

import { useState, useEffect, useRef } from 'react';
import { Truck, LogOut, Package, MapPin, CheckCircle, XCircle, User, Navigation, Phone, Clock } from 'lucide-react';
import SignaturePad from '@/components/SignaturePad';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export default function DriverApp() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [driverId, setDriverId] = useState(null);
    const [stops, setStops] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [credential, setCredential] = useState({ username: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [currentStop, setCurrentStop] = useState(null);
    const [showPod, setShowPod] = useState(false);
    const [podPhoto, setPodPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const sigRef = useRef(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const sid = localStorage.getItem('driver_id');
        if (token && sid) {
            setIsLoggedIn(true);
            setDriverId(sid);
            loadRoute(sid, token);
        } else {
            setIsLoading(false);
        }
    }, []);

    // Heartbeat Effect: Keep driver online while app is open
    useEffect(() => {
        if (!isLoggedIn) return;

        const sendHeartbeat = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                await fetch(`${API_BASE}/drivers/heartbeat`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (err) {
                console.warn('Heartbeat failed', err);
            }
        };

        // Send initial heartbeat and then every 1 minute
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, 60000);
        return () => clearInterval(interval);
    }, [isLoggedIn]);

    const loadRoute = async (sid, token) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/drivers/${sid}/route`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) {
                logout();
                return;
            }
            const data = await res.json();
            setStops(data.stops || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        try {
            const formData = new FormData();
            formData.append('username', credential.username);
            formData.append('password', credential.password);

            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('driver_id', data.driver_id);
                setDriverId(data.driver_id);
                setIsLoggedIn(true);
                loadRoute(data.driver_id, data.access_token);
            } else {
                setLoginError('Invalid username or password');
            }
        } catch (err) {
            setLoginError('Connection error');
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('driver_id');
        setIsLoggedIn(false);
        setStops([]);
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPodPhoto(file);
            const reader = new FileReader();
            reader.onload = (re) => setPhotoPreview(re.target.result);
            reader.readAsDataURL(file);
        }
    };

    const submitPod = async () => {
        setIsUploading(true);
        const token = localStorage.getItem('token');
        const signature = sigRef.current?.getBase64();

        try {
            const formData = new FormData();
            if (podPhoto) formData.append('photo', podPhoto);
            if (signature) formData.append('signature', signature);

            const podRes = await fetch(`${API_BASE}/stops/${currentStop.stop_id}/pod`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (podRes.ok) {
                await fetch(`${API_BASE}/stops/${currentStop.stop_id}/status?status=DELIVERED`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setShowPod(false);
                loadRoute(driverId, token);
            }
        } catch (err) {
            alert('Failed to save POD');
        } finally {
            setIsUploading(false);
        }
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-[#0f111a] text-white">Loading...</div>;

    if (!isLoggedIn) {
        return (
            <div style={{
                minHeight: '100vh',
                backgroundColor: '#0f111a',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                fontFamily: "'Outfit', sans-serif"
            }}>
                {/* Logo Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        background: 'linear-gradient(135deg, #00d2ff, #9d50bb)',
                        borderRadius: '8px',
                        boxShadow: '0 0 15px rgba(0, 210, 255, 0.4)'
                    }}></div>
                    <h1 style={{
                        fontSize: '24px',
                        fontWeight: '700',
                        color: 'white',
                        margin: 0
                    }}>OptiRoute</h1>
                </div>

                {/* Login Card */}
                <div style={{
                    width: '100%',
                    maxWidth: '400px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '20px',
                    padding: '40px',
                    textAlign: 'center',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '30px' }}>Driver Access</h2>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <input
                            type="text"
                            value={credential.username}
                            onChange={e => setCredential({ ...credential, username: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '15px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                color: 'white',
                                outline: 'none'
                            }}
                            placeholder="Username (e.g. john)"
                            required
                        />
                        <input
                            type="password"
                            value={credential.password}
                            onChange={e => setCredential({ ...credential, password: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '15px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                color: 'white',
                                outline: 'none'
                            }}
                            placeholder="Password"
                            required
                        />

                        {loginError && (
                            <p style={{ color: '#ff4b2b', fontSize: '14px', margin: '5px 0' }}>{loginError}</p>
                        )}

                        <button style={{
                            width: '100%',
                            padding: '15px',
                            marginTop: '10px',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #00d2ff, #9d50bb)',
                            color: 'white',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0, 210, 255, 0.3)'
                        }}>
                            Sign In
                        </button>
                    </form>
                </div>

                {/* Helper Text */}
                <p style={{ marginTop: '30px', fontSize: '14px', color: '#a0a0a0' }}>
                    Use <b style={{ color: 'white' }}>john/jane/bob</b> and <b style={{ color: 'white' }}>password123</b>
                </p>
            </div>
        );
    }

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f111a',
            color: 'white',
            overflow: 'hidden',
            fontFamily: "'Outfit', sans-serif"
        }}>
            {/* Header */}
            <header style={{
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#1a1c26',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#00d2ff',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <User size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '14px', fontWeight: '700', margin: 0 }}>Driver Space</h2>
                        <div style={{
                            fontSize: '10px',
                            color: '#00ff88',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '700'
                        }}>
                            <span style={{
                                width: '6px',
                                height: '6px',
                                backgroundColor: '#00ff88',
                                borderRadius: '50%',
                                boxShadow: '0 0 8px #00ff88'
                            }}></span>
                            ONLINE
                        </div>
                    </div>
                </div>
                <button
                    onClick={logout}
                    style={{
                        padding: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: '#a0a0a0',
                        cursor: 'pointer',
                        transition: 'color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#ff4b2b'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#a0a0a0'}
                >
                    <LogOut size={20} />
                </button>
            </header>

            {/* Main List */}
            <main style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                paddingBottom: '100px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <h3 style={{
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontWeight: '700',
                    color: '#a0a0a0',
                    paddingLeft: '8px',
                    margin: 0
                }}>
                    Assigned Stops ({stops.length})
                </h3>

                {stops.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '80px 0',
                        color: '#a0a0a0',
                        gap: '12px'
                    }}>
                        <Package size={32} opacity={0.3} />
                        <p style={{ fontSize: '14px' }}>No deliveries assigned yet.</p>
                    </div>
                ) : (
                    stops.map(stop => (
                        <div key={stop.stop_id} style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            opacity: stop.stop_status === 'DELIVERED' ? 0.6 : 1,
                            filter: stop.stop_status === 'DELIVERED' ? 'grayscale(0.5)' : 'none',
                            transition: 'all 0.3s'
                        }}>
                            <div style={{ padding: '24px' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: '16px'
                                }}>
                                    <div style={{
                                        fontSize: '10px',
                                        fontWeight: '900',
                                        letterSpacing: '0.1em',
                                        color: '#00d2ff',
                                        textTransform: 'uppercase'
                                    }}>
                                        Stop #{stop.sequence_number}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#a0a0a0', fontWeight: '500' }}>
                                        {new Date(stop.estimated_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>

                                <h4 style={{
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    marginBottom: '20px',
                                    display: 'flex',
                                    alignItems: 'start',
                                    gap: '12px'
                                }}>
                                    <MapPin size={22} style={{ marginTop: '2px', flexShrink: 0, color: '#a0a0a0' }} />
                                    {stop.delivery_address}
                                </h4>

                                <div style={{
                                    display: 'flex',
                                    gap: '24px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    marginBottom: '24px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.5 }}>Recipient</span>
                                        <span style={{ fontSize: '13px', fontWeight: '700' }}>{stop.contact_person || 'N/A'}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.5 }}>Mobile</span>
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#00d2ff' }}>{stop.contact_mobile || 'N/A'}</span>
                                    </div>
                                </div>

                                <button
                                    disabled={stop.stop_status === 'DELIVERED'}
                                    onClick={() => { setCurrentStop(stop); setShowPod(true); }}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        borderRadius: '14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        fontWeight: '900',
                                        fontSize: '14px',
                                        border: 'none',
                                        cursor: stop.stop_status === 'DELIVERED' ? 'default' : 'pointer',
                                        transition: 'all 0.3s',
                                        backgroundColor: stop.stop_status === 'DELIVERED' ? 'rgba(0, 255, 136, 0.1)' : '#00d2ff',
                                        color: stop.stop_status === 'DELIVERED' ? '#00ff88' : 'white',
                                        boxShadow: stop.stop_status === 'DELIVERED' ? 'none' : '0 10px 20px rgba(0, 210, 255, 0.2)'
                                    }}
                                >
                                    {stop.stop_status === 'DELIVERED' ? (
                                        <><CheckCircle size={18} /> DELIVERED</>
                                    ) : (
                                        'COMPLETE DELIVERY'
                                    )}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </main>

            {/* POD Modal Overlay */}
            {showPod && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2000,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    padding: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(8px)'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '500px',
                        backgroundColor: '#161925',
                        borderTopLeftRadius: '32px',
                        borderTopRightRadius: '32px',
                        padding: '32px',
                        boxShadow: '0 -20px 40px rgba(0, 0, 0, 0.4)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Proof of Delivery</h3>
                            <button onClick={() => setShowPod(false)} style={{ background: 'transparent', border: 'none', color: '#a0a0a0', cursor: 'pointer' }}>
                                <XCircle size={28} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#a0a0a0', letterSpacing: '0.1em' }}>Recipient Signature</label>
                                <div style={{ border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', overflow: 'hidden' }}>
                                    <SignaturePad ref={sigRef} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#a0a0a0', letterSpacing: '0.1em' }}>Photo Evidence</label>
                                <div style={{ position: 'relative' }}>
                                    <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} id="photo-input" />
                                    <label htmlFor="photo-input" style={{
                                        width: '100%',
                                        height: '140px',
                                        borderRadius: '20px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px dashed rgba(255, 255, 255, 0.2)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        transition: 'background 0.2s'
                                    }}>
                                        {photoPreview ? (
                                            <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                                        ) : (
                                            <>
                                                <Package size={28} style={{ color: '#a0a0a0', marginBottom: '8px' }} />
                                                <span style={{ fontSize: '10px', fontWeight: '700', color: '#a0a0a0' }}>TAP TO CAPTURE PHOTO</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <button
                                disabled={isUploading}
                                onClick={submitPod}
                                style={{
                                    width: '100%',
                                    padding: '20px',
                                    borderRadius: '16px',
                                    backgroundColor: '#00ff88',
                                    color: '#0f111a',
                                    fontWeight: '900',
                                    fontSize: '15px',
                                    border: 'none',
                                    marginTop: '8px',
                                    cursor: isUploading ? 'default' : 'pointer',
                                    opacity: isUploading ? 0.5 : 1,
                                    boxShadow: '0 12px 24px rgba(0, 255, 136, 0.2)'
                                }}
                            >
                                {isUploading ? 'COMPLETE...' : 'CONFIRM DELIVERY'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
