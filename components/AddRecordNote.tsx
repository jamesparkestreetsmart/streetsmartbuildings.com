"use client";

import { useState } from "react";

export default function AddRecordNote({ orgId, siteId, equipmentId }: {
  orgId: string | null;
  siteId: string;
  equipmentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const submitNote = async () => {
    if (!note.trim()) return;

    setLoading(true);

    const response = await fetch("/api/records/add-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        site_id: siteId,
        equipment_id: equipmentId,
        device_id: null,
        note,
        event_date: eventDate,
      }),
    });

    const result = await response.json();
    console.log("Add note response:", { response: response.status, result });

    if (!response.ok) {
      console.error("Failed to add note:", result);
      alert("Failed to save note: " + (result.error || "Unknown error"));
    }

    setLoading(false);
    setNote("");
    setOpen(false);

    // Client component is allowed to refresh the page
    window.location.reload();
  };

  return (
    <div className="mb-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"
        >
          + Add Note
        </button>
      ) : (
        <div className="border rounded p-3 space-y-3 bg-gray-50">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write a note..."
            className="w-full border rounded p-2 text-sm"
            rows={3}
          />

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Date:</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="border rounded p-1 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={submitNote}
              disabled={loading || !note.trim()}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>

            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 bg-gray-300 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
