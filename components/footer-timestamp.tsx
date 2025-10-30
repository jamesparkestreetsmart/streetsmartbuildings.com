"use client"
import { useState, useEffect } from "react"

export default function FooterTimestamp() {
  const [lastUpdated, setLastUpdated] = useState("")

  useEffect(() => {
    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    setLastUpdated(now)
  }, [])

  return (
    <div className="text-xs text-gray-400">
      Auto-refreshes every 5 minutes • Last Updated: {lastUpdated}
    </div>
  )
}
