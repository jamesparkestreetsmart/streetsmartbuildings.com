"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Menu } from "lucide-react"

interface AlertLog {
  id: number
  site_id: string
  site_name?: string // ✅ Added site_name
  site_address?: string //
  device_id: string
  category: string
  parameter: string
  alert_type: string
  alert_message: string
  severity: string
  value: string
  threshold: string
  status: string
  timestamp: string
  resolved_at: string | null
}

export default function AlertHistoryPage() {
  const [logs, setLogs] = useState<AlertLog[]>([])
  const [sortColumn, setSortColumn] = useState<keyof AlertLog>("timestamp")
  const [sortAsc, setSortAsc] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<string>("")

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

  // 🧮 Calculate duration between timestamps
  const calcDuration = (start: string, end: string | null) => {
    if (!end) return "-"
    const diffMs = new Date(end).getTime() - new Date(start).getTime()
    if (diffMs <= 0) return "-"
    const totalMinutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const fetchLogs = async () => {
  const { data, error } = await supabase
    .from("alerts_log")
    .select(`
      id,
      device_id,
      category,
      parameter,
      alert_type,
      alert_message,
      severity,
      value,
      threshold,
      status,
      timestamp,
      resolved_at,
      site_id,
      sites (
        name,
        address_line1,
        address_line2,
        city,
        state,
        postal_code
      )
    `)
    .order("timestamp", { ascending: false })
    .limit(200)

  if (error) {
    console.error("Error fetching alert history:", error)
  } else {
    // Flatten site data for simpler rendering
    const withNames = (data || []).map((row: any) => ({
      ...row,
      site_name: row.sites?.name || "-",
      site_address: [
        row.sites?.address_line1,
        row.sites?.address_line2,
        row.sites?.city,
        row.sites?.state,
        row.sites?.postal_code,
      ]
        .filter(Boolean)
        .join(", "),
    }))
    setLogs(withNames)
    setLastUpdated(formatCST(new Date()))
  }
}

  const handleSort = (col: keyof AlertLog) => {
    if (sortColumn === col) setSortAsc(!sortAsc)
    else {
      setSortColumn(col)
      setSortAsc(true)
    }
  }

  const downloadCSV = () => {
    const csvRows = []
    const headers = [
      "Site Name",
      "Device ID",
      "Category",
      "Parameter",
      "Alert Type",
      "Message",
      "Severity",
      "Value",
      "Threshold",
      "Status",
      "Start Time",
      "Resolved Time",
      "Alert Duration",
    ]
    csvRows.push(headers.join(","))
    logs.forEach((a) => {
      const row = [
        a.site_name || "",
        a.device_id,
        a.category,
        a.parameter,
        a.alert_type,
        a.alert_message,
        a.severity,
        a.value,
        a.threshold,
        a.status,
        a.timestamp,
        a.resolved_at || "",
        calcDuration(a.timestamp, a.resolved_at),
      ]
      csvRows.push(row.join(","))
    })
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `alert_history_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`
    link.click()
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const sorted = [...logs].sort((a, b) => {
    const valA = a[sortColumn]
    const valB = b[sortColumn]
    if (typeof valA === "number" && typeof valB === "number")
      return sortAsc ? valA - valB : valB - valA
    return sortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA))
  })

  return (
    <div className="flex min-h-screen bg-gray-100 text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md hidden md:flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-emerald-600">🦅 Eagle Eyes</h1>
          <p className="text-sm text-gray-500">Building Solutions</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => (window.location.href = "/")}
          >
            Live Alerts
          </Button>
          <Button variant="secondary" className="w-full justify-start font-semibold">
            Alert History
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Sites
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Equipment Benchmarking
          </Button>
        </nav>
        <div className="p-4 text-xs text-gray-400 border-t">
          © 2025 Eagle Eyes LLC
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between bg-white shadow px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button className="md:hidden">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold text-emerald-700">Alert History</h2>
          </div>
          <div className="text-sm text-gray-500">Full Alert Logbook</div>
        </header>

        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center justify-between mb-3 flex-wrap">
            <h3 className="text-lg font-semibold">Historical Alerts</h3>
            <div className="flex gap-3 text-xs text-gray-500">
              <button
                onClick={downloadCSV}
                className="text-emerald-600 hover:underline font-medium"
              >
                ⬇ Download CSV
              </button>
              <span>Last Updated: {lastUpdated}</span>
            </div>
          </div>

          <Separator />

          <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  {[
                    ["site_name", "Site Name"],
                    ["device_id", "Device"],
                    ["category", "Category"],
                    ["parameter", "Parameter"],
                    ["alert_type", "Alert Type"],
                    ["severity", "Severity"],
                    ["status", "Status"],
                    ["timestamp", "Start Time"],
                    ["resolved_at", "Resolved Time"],
                    ["duration", "Alert Duration"],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      className="pb-2 cursor-pointer select-none"
                      onClick={() => handleSort(key as keyof AlertLog)}
                    >
                      {label}
                      {sortColumn === key && (sortAsc ? " ▲" : " ▼")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-gray-500">
                      No logged alerts
                    </td>
                  </tr>
                ) : (
                  sorted.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2">
  <div className="font-medium">{a.site_name || "-"}</div>
  {a.site_address && (
    <div className="text-xs text-gray-500">{a.site_address}</div>
  )}
</td>

                      <td className="py-2">{a.device_id}</td>
                      <td className="py-2">{a.category}</td>
                      <td className="py-2">{a.parameter}</td>
                      <td className="py-2">{a.alert_type}</td>
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
                      <td
                        className={`py-2 ${
                          a.status === "resolved"
                            ? "text-green-600 font-medium"
                            : "text-gray-500"
                        }`}
                      >
                        {a.status}
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
                      <td className="py-2 text-gray-500">
                        {a.resolved_at
                          ? new Date(a.resolved_at).toLocaleString("en-US", {
                              timeZone: "America/Chicago",
                              hour12: true,
                              hour: "numeric",
                              minute: "2-digit",
                              month: "short",
                              day: "numeric",
                            })
                          : "-"}
                      </td>
                      <td className="py-2 text-gray-600">
                        {calcDuration(a.timestamp, a.resolved_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
