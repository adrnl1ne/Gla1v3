import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function WorldMap({ agents, getColor, agent }) {
  // If a single agent is provided, center on it and show a focused map
  const center = agent && agent.lat && agent.lng ? [agent.lat, agent.lng] : [20, 0];
  const zoom = agent && agent.lat && agent.lng ? 6 : 2;

  const markers = agent ? [agent] : (agents || []);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap & Carto'
      />
      {markers.map(a => (
        <Marker
          key={a.id}
          position={[a.lat || 20 + Math.random() * 20, a.lng || -40 + Math.random() * 80]}
          icon={L.divIcon({
            className: '',
            html: `<div style="background:${getColor(a.lastSeen)};width:14px;height:14px;border-radius:50%;border:3px solid #000;box-shadow:0 0 12px #fff;"></div>`,
            iconSize: [14, 14],
          })}
        >
          <Popup>
            <div style={{ fontFamily: 'monospace', minWidth: '200px' }}>
              <strong>{a.id}</strong><br />
              CN: <span style={{ color: '#ff7b72' }}>{a.cn}</span><br />
              IP: {a.ip}<br />
              {a.geo && (<>Location: {a.geo.city || ''} {a.geo.country ? '(' + a.geo.country + ')' : ''}<br /></>)}
              Last: {new Date(a.lastSeen).toLocaleTimeString()}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}