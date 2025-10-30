"use client"

import dynamic from "next/dynamic"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { useEffect, useState } from "react"

// ✅ Dynamic import for client-only rendering
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false })
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false })

export default function SitesMapClient() {
  const [isClient, setIsClient] = useState(false)

  // ✅ Only render map after component mounts
  useEffect(() => {
    setIsClient(true)
  }, [])

  const defaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    shadowSize: [41, 41],
  })

  if (!isClient) {
    // 👇 Prevent Leaflet initialization until browser mount
    return (
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Site Map</h3>
        <div className="h-80 rounded overflow-hidden bg-gray-100 flex items-center justify-center text-gray-500">
          Loading map...
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Site Map</h3>
      <div className="h-80 rounded overflow-hidden">
        <MapContainer
          center={[36.1627, -86.7816]} // Nashville
          zoom={12}
          className="h-full w-full"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <Marker position={[36.1627, -86.7816]} icon={defaultIcon}>
            <Popup>Nashville HQ</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  )
}
