"use client"
import { useState, useEffect } from "react"

export default function FooterTimestamp() {
  const formatNow = () =>
    new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  // Initialize using a lazy state initializer to avoid calling setState
  // synchronously inside an effect (eslint: react-hooks/set-state-in-effect)
  const [lastUpdated, setLastUpdated] = useState<string>(() => formatNow())

  // Auto-refresh the timestamp every 5 minutes. The `setLastUpdated` call
  // happens inside the interval callback (not synchronously in the effect body)
  // which satisfies the react-hooks lint rule.
  useEffect(() => {
    const id = setInterval(() => {
      setLastUpdated(formatNow())
    }, 5 * 60 * 1000)

    return () => clearInterval(id)
  }, [])

  return (
    <div className="text-xs text-gray-400">
      Auto-refreshes every 5 minutes • Last Updated: {lastUpdated}
    </div>
  )
}
