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
  // Helper: coerce a value to a finite number or return null
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const hashToLatLng = (s) => {
    // deterministic but simple hash -> [-85..85], [-180..180]
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    const lat = -85 + (h % 170);
    const lng = -180 + ((h >>> 8) % 360);
    return [lat, lng];
  };

  // If a single agent is provided, center on it and show a focused map
  const agentLat = agent ? toNum(agent.latitude || agent.lat) : null;
  const agentLng = agent ? toNum(agent.longitude || agent.lng) : null;
  const center = agentLat !== null && agentLng !== null ? [agentLat, agentLng] : [20, 0];
  const zoom = agentLat !== null && agentLng !== null ? 6 : 2;

  const markers = agent ? [agent] : (agents || []);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap & Carto'
      />
      {markers.map(a => {
        const lat = toNum(a.latitude || a.lat);
        const lng = toNum(a.longitude || a.lng);
        const [fbLat, fbLng] = hashToLatLng(a.id || String(Math.random()));
        const position = [lat !== null ? lat : fbLat, lng !== null ? lng : fbLng];
        
        const geoLocation = a.geo_city && a.geo_country
          ? `${a.geo_city}, ${a.geo_country}`
          : a.geo?.city && a.geo?.country
          ? `${a.geo.city}, ${a.geo.country}`
          : null;

        return (
        <Marker
          key={a.id}
          position={position}
          icon={L.divIcon({
            className: '',
            html: `<div style="background:${getColor(a.last_seen || a.lastSeen)};width:14px;height:14px;border-radius:50%;border:3px solid #000;box-shadow:0 0 12px #fff;"></div>`,
            iconSize: [14, 14],
          })}
        >
          <Popup>
            <div style={{ fontFamily: 'monospace', minWidth: '200px' }}>
              <strong>{a.id}</strong><br />
              CN: <span style={{ color: '#ff7b72' }}>{a.cn}</span><br />
              Public IP: <span style={{ color: '#79c0ff' }}>{a.ip_address || a.ip}</span><br />
              {geoLocation && (<>Location: {geoLocation}<br /></>)}
              Last: {new Date(a.last_seen || a.lastSeen).toLocaleString()}
            </div>
          </Popup>
        </Marker>
      )})}
    </MapContainer>
  );
}