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

export default function WorldMap({ agents, getColor }) {
  return (
    <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap & Carto'
      />
      {agents.map(agent => (
        <Marker
          key={agent.id}
          position={[agent.lat || 20 + Math.random() * 20, agent.lng || -40 + Math.random() * 80]}
          icon={L.divIcon({
            className: '',
            html: `<div style="background:${getColor(agent.lastSeen)};width:14px;height:14px;border-radius:50%;border:3px solid #000;box-shadow:0 0 12px #fff;"></div>`,
            iconSize: [14, 14],
          })}
        >
          <Popup>
            <div style={{ fontFamily: 'monospace', minWidth: '200px' }}>
              <strong>{agent.id}</strong><br />
              CN: <span style={{ color: '#ff7b72' }}>{agent.cn}</span><br />
              IP: {agent.ip}<br />
              Last: {new Date(agent.lastSeen).toLocaleTimeString()}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}