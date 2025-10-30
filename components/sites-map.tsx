"use client"

import dynamic from "next/dynamic"
import "leaflet/dist/leaflet.css"

// Dynamically import react-leaflet to disable SSR (server-side rendering)
const Map = dynamic(() => import("./sites-map-client"), {
  ssr: false,
})

export default function SitesMapWrapper() {
  return <Map />
}
