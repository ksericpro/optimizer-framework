'use client';

import { useState, useEffect, useRef } from 'react';
import { Truck, LogOut, Package, MapPin, CheckCircle, XCircle } from 'lucide-react';
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
            <div className="h-screen flex flex-col items-center justify-center bg-[#0f111a] p-6">
                <div className="w-full max-w-sm glass p-8 space-y-6">
                    <div className="text-center">
                        <Truck size={48} className="mx-auto text-[#00d2ff] mb-4" />
                        <h1 className="text-2xl font-bold text-white">Driver Login</h1>
                        <p className="text-sm text-[#a0a0a0]">Enter your assigned credentials</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-[#a0a0a0] mb-1">Username</label>
                            <input
                                type="text"
                                value={credential.username}
                                onChange={e => setCredential({ ...credential, username: e.target.value })}
                                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-[#00d2ff] outline-none transition-all"
                                placeholder="e.g. john"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-[#a0a0a0] mb-1">Password</label>
                            <input
                                type="password"
                                value={credential.password}
                                onChange={e => setCredential({ ...credential, password: e.target.value })}
                                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-[#00d2ff] outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                        {loginError && <p className="text-[#ff4b2b] text-xs font-bold">{loginError}</p>}
                        <button className="w-full py-4 rounded-xl bg-[#00d2ff] text-white font-bold shadow-lg shadow-[#00d2ff]/20 hover:scale-[1.01] active:scale-95 transition-all">
                            Sign In
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#0f111a] text-white overflow-hidden">
            {/* Header */}
            <header className="p-6 flex items-center justify-between border-b border-white/10 bg-white/2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[#00d2ff]">
                        {driverId?.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                        <h2 className="text-sm font-bold">Driver Space</h2>
                        <div className="text-[10px] text-[#00ff88] flex items-center gap-1 font-bold">● ONLINE</div>
                    </div>
                </div>
                <button onClick={logout} className="p-2 text-[#a0a0a0] hover:text-[#ff4b2b] transition-colors"><LogOut size={20} /></button>
            </header>

            {/* Main List */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                <h3 className="text-xs uppercase tracking-widest font-bold text-[#a0a0a0] px-2">Assigned Stops ({stops.length})</h3>
                {stops.length === 0 ? (
                    <div className="text-center py-20 text-[#a0a0a0]">No deliveries assigned yet.</div>
                ) : (
                    stops.map(stop => (
                        <div key={stop.stop_id} className={`glass overflow-hidden ${stop.stop_status === 'DELIVERED' ? 'opacity-50 grayscale' : ''}`}>
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="text-[10px] font-black tracking-widest text-[#00d2ff] uppercase">Stop #{stop.sequence_number}</div>
                                    <div className="text-[10px] text-[#a0a0a0] font-bold">{new Date(stop.estimated_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                                <h4 className="text-lg font-bold mb-2 flex items-start gap-2"><MapPin size={20} className="shrink-0 text-[#a0a0a0]" /> {stop.delivery_address}</h4>
                                <div className="flex gap-4 text-xs text-[#a0a0a0] bg-white/2 p-3 rounded-lg mb-4">
                                    <div className="flex flex-col">
                                        <span className="uppercase text-[9px] font-bold mb-1 opacity-50">Contact</span>
                                        <span className="text-white font-bold">{stop.contact_person || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="uppercase text-[9px] font-bold mb-1 opacity-50">Phone</span>
                                        <span className="text-[#00d2ff] font-bold">{stop.contact_mobile || 'N/A'}</span>
                                    </div>
                                </div>
                                <button
                                    disabled={stop.stop_status === 'DELIVERED'}
                                    onClick={() => { setCurrentStop(stop); setShowPod(true); }}
                                    className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-black text-sm transition-all ${stop.stop_status === 'DELIVERED' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-[#00d2ff] text-white shadow-lg shadow-[#00d2ff]/20'}`}
                                >
                                    {stop.stop_status === 'DELIVERED' ? <><CheckCircle size={18} /> Delivered</> : 'Complete Delivery'}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </main>

            {/* POD Modal */}
            {showPod && (
                <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-[#161925] rounded-t-3xl sm:rounded-3xl p-8 animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Proof of Delivery</h3>
                            <button onClick={() => setShowPod(false)} className="text-[#a0a0a0]"><XCircle size={24} /></button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="block text-[10px] uppercase font-bold text-[#a0a0a0]">Recipient Signature</label>
                                <SignaturePad ref={sigRef} />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] uppercase font-bold text-[#a0a0a0]">Photo Proof</label>
                                <div className="relative">
                                    <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="photo-input" />
                                    <label htmlFor="photo-input" className="w-full h-32 rounded-xl bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all overflow-hidden">
                                        {photoPreview ? (
                                            <img src={photoPreview} className="w-full h-full object-cover" alt="Preview" />
                                        ) : (
                                            <>
                                                <Package size={24} className="text-[#a0a0a0] mb-2" />
                                                <span className="text-[10px] font-bold text-[#a0a0a0]">TAP TO UPLOAD PHOTO</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <button
                                disabled={isUploading}
                                onClick={submitPod}
                                className="w-full py-4 rounded-xl bg-[#00ff88] text-slate-900 font-black text-sm shadow-xl shadow-[#00ff88]/10 disabled:opacity-50"
                            >
                                {isUploading ? 'Uploading...' : 'Complete Delivery'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
