"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

// Default marker assets are resolved from CSS urls that break under bundlers;
// point them at the CDN copies shipped with the same Leaflet version.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function VenueMap({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer
      key={`${lat.toFixed(4)}:${lng.toFixed(4)}`}
      center={[lat, lng]}
      zoom={14}
      style={{ height: 220, width: "100%" }}
      className="rounded-lg border border-border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onMove} />
      <Marker
        position={[lat, lng]}
        icon={markerIcon}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const position = (event.target as L.Marker).getLatLng();
            onMove(position.lat, position.lng);
          },
        }}
      />
    </MapContainer>
  );
}
