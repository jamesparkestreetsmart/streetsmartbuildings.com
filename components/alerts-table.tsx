"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

interface Alert {
  id: number
  device_id: string
  location: string
  category: string
  parameter: string
  alert_type: string
  alert_message: string
  severity: string
  value: string
  threshold: string
  status: string
  timestamp: string
}

export default function AlertsTable() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [lastUpdated, setLastUpdated] = useState<string>("") // ⬅️ Start blank

  const formatCST = (date: Date) =>
    date.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour12: true,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("alerts_live") // ✅ your live alerts table
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50)

      if (error) {
        console.error("Error fetching alerts:", error)
      } else {
        setAlerts(data || [])
        setLastUpdated(formatCST(new Date()))
      }
    } catch (err) {
      console.error("Unexpected error fetching alerts:", err)
    }
  }

  useEffect(() => {
    // Run once after mount to populate data and timestamp
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3 flex-wrap">
        <h3 className="text-lg font-semibold">Active Alerts</h3>
        {lastUpdated && ( // ⬅️ only render once available
          <span className="text-xs text-gray-500 text-right sm:text-left">
            Auto-refreshes every 5 minutes • Last Updated: {lastUpdated}
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-2">Location</th>
            <th className="pb-2">Type</th>
            <th className="pb-2">Message</th>
            <th className="pb-2">Value (Δ)</th>
            <th className="pb-2">Severity</th>
            <th className="pb-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {alerts.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 text-center text-gray-500">
                No active alerts
              </td>
            </tr>
          ) : (
            alerts.map((a) => {
              const diff = parseFloat(a.value) - parseFloat(a.threshold)
              const diffText = isNaN(diff) ? "" : `${diff.toFixed(1)}°F`

              return (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">{a.location}</td>
                  <td className="py-2">{a.category}</td>
                  <td className="py-2">{a.alert_message}</td>
                  <td className="py-2">
                    {a.value} ({diffText})
                  </td>
                  <td
                    className={`py-2 font-semibold ${
                      a.severity === "critical"
                        ? "text-red-600"
                        : a.severity === "warning"
                        ? "text-yellow-600"
                        : "text-gray-600"
                    }`}
                  >
                    {a.severity}
                  </td>
                  <td className="py-2 text-gray-500">
                    {new Date(a.timestamp).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                      hour12: true,
                      hour: "numeric",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
