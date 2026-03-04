"use client";

import { useState, useEffect, useRef } from "react";

interface PairingSectionProps {
  deviceId: string;
  siteId: string;
  pairingStatus: string;
  smartstartDsk: string | null;
  inclusionPin: string | null;
  pairedAt: string | null;
  pairingError: string | null;
  onStatusChange: () => void;
}

export default function PairingSection({
  deviceId,
  siteId,
  pairingStatus,
  smartstartDsk,
  inclusionPin,
  pairedAt,
  pairingError,
  onStatusChange,
}: PairingSectionProps) {
  const [status, setStatus] = useState(pairingStatus);
  const [error, setError] = useState(pairingError);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPairing = status === "pairing";
  const mode = smartstartDsk ? "smartstart" : "classic";

  // Poll pair-status every 5s while pairing
  useEffect(() => {
    if (!isPairing) {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/devices/${deviceId}/pair-status`);
        const data = await res.json();
        if (data.pairing_status && data.pairing_status !== "pairing") {
          setStatus(data.pairing_status);
          setError(data.pairing_error || null);
          if (data.pairing_status === "paired") {
            onStatusChange();
          }
        }
        if (data.elapsed_seconds) setElapsed(data.elapsed_seconds);
      } catch {
        // Retry on next poll
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPairing, deviceId, onStatusChange]);

  const startPairing = async () => {
    setLoading(true);
    setError(null);
    setElapsed(0);
    try {
      const res = await fetch(`/api/devices/${deviceId}/pair`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatus("pairing");
      } else {
        setError(data.error || "Failed to start pairing");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  const cancelPairing = async () => {
    setLoading(true);
    try {
      await fetch(`/api/devices/${deviceId}/pair-cancel`, { method: "POST" });
      setStatus("unpaired");
      setElapsed(0);
    } catch {
      setError("Failed to cancel");
    }
    setLoading(false);
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const statusBadge = () => {
    switch (status) {
      case "paired":
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Paired</span>;
      case "pairing":
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 animate-pulse">Pairing...</span>;
      case "failed":
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Failed</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Unpaired</span>;
    }
  };

  return (
    <div className="bg-white border rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Z-Wave Pairing</h2>
        {statusBadge()}
      </div>

      {/* Mode info */}
      {status !== "paired" && (
        <div className="text-sm text-gray-600 mb-4">
          {mode === "smartstart" ? (
            <p>SmartStart mode: Power on the device and it will join the network automatically.</p>
          ) : (
            <p>Classic inclusion mode: Power on the device and enter the PIN when prompted.</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Pairing progress */}
      {isPairing && (
        <div className="text-sm text-gray-600 mb-4">
          Elapsed: <span className="font-mono">{formatElapsed(elapsed)}</span>
        </div>
      )}

      {/* Success */}
      {status === "paired" && pairedAt && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 mb-4">
          Successfully paired on {new Date(pairedAt).toLocaleString()}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {status === "unpaired" && (
          <button
            onClick={startPairing}
            disabled={loading}
            className="px-4 py-1.5 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "Starting..." : "Start Pairing"}
          </button>
        )}

        {isPairing && (
          <button
            onClick={cancelPairing}
            disabled={loading}
            className="px-4 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        {status === "paired" && (
          <button
            onClick={startPairing}
            disabled={loading}
            className="px-4 py-1.5 text-sm text-purple-700 bg-purple-50 rounded-md hover:bg-purple-100 disabled:opacity-50"
          >
            Re-pair
          </button>
        )}

        {status === "failed" && (
          <button
            onClick={startPairing}
            disabled={loading}
            className="px-4 py-1.5 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
