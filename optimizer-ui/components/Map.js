'use client';

import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import L from 'leaflet';

// Fix Leaflet default icon issue in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function Map({ routes = [], pendingOrders = [], driverLocations = {}, onOrderClick }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return (
            <div style={{ height: '100%', background: '#0f111a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#00d2ff', fontSize: '14px', fontWeight: 'bold' }}>Loading Map...</div>
            </div>
        );
    }

    const colors = ['#00d2ff', '#9d50bb', '#ff0088', '#00ff88', '#ffd700'];

    return (
        <MapContainer
            center={[1.3521, 103.8198]}
            zoom={12}
            style={{ height: '100%', width: '100%', background: '#1a1c2c' }}
            zoomControl={false}
            attributionControl={false}
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />

            {/* Pending Orders */}
            {pendingOrders.map(order => (
                <CircleMarker
                    key={order.id}
                    center={[order.lat, order.lng]}
                    radius={6}
                    pathOptions={{
                        fillColor: '#ffd700',
                        color: '#fff',
                        weight: 1,
                        opacity: 0.8,
                        fillOpacity: 0.8
                    }}
                >
                    <Tooltip>Pending: {order.delivery_address}</Tooltip>
                </CircleMarker>
            ))}

            {/* Routes & Stops */}
            {routes.map((route, idx) => {
                const routeCoords = [[1.3521, 103.8198], ...route.stops.map(s => [s.lat, s.lng])];
                const routeColor = colors[idx % colors.length];

                return (
                    <div key={route.route_id}>
                        <Polyline
                            positions={routeCoords}
                            pathOptions={{
                                color: routeColor,
                                weight: 3,
                                opacity: 0.5,
                                dashArray: '5, 10'
                            }}
                        />
                        {route.stops.map(stop => (
                            <CircleMarker
                                key={stop.stop_id}
                                center={[stop.lat, stop.lng]}
                                radius={8}
                                pathOptions={{
                                    fillColor: stop.stop_status === 'DELIVERED' ? '#00ff88' : routeColor,
                                    color: '#fff',
                                    weight: 2,
                                    opacity: 1,
                                    fillOpacity: 1
                                }}
                            >
                                <Tooltip>
                                    <div className="popup-content">
                                        <b>Order #{stop.stop_id.substring(0, 8)}</b><br />
                                        Status: <span className={`status-tag ${stop.stop_status.toLowerCase()}`}>{stop.stop_status}</span><br />
                                        {stop.delivery_address}<br />
                                        ETA: {new Date(stop.estimated_arrival_time).toLocaleTimeString()}
                                    </div>
                                </Tooltip>
                            </CircleMarker>
                        ))}
                    </div>
                );
            })}

            {/* Driver Locations */}
            {Object.values(driverLocations).map(driver => (
                <CircleMarker
                    key={driver.driver_id}
                    center={[driver.lat, driver.lng]}
                    radius={12}
                    pathOptions={{
                        fillColor: '#1a1c2c',
                        color: '#00d2ff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    }}
                // In a real app we'd use a custom Icon with 🚚 icon
                >
                    <Tooltip permanent direction="top">{driver.full_name || 'Driver'}</Tooltip>
                </CircleMarker>
            ))}

            <ZoomControl position="bottomright" />
        </MapContainer>
    );
}
