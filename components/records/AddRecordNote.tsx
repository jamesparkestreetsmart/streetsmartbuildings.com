"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  orgId: string;
  siteId?: string;
  equipmentId?: string;
  deviceId?: string;
  haDeviceId?: string;
  onSuccess?: () => void;
}

export default function AddRecordNote({
  orgId,
  siteId,
  equipmentId,
  deviceId,
  haDeviceId,
  onSuccess,
}: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNote() {
    if (!note.trim()) {
      setError("Note cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await fetch("/api/records/add-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        site_id: siteId,
        equipment_id: equipmentId,
        device_id: deviceId,
        ha_device_id: haDeviceId,
        note,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error || "Failed to save note.");
      setSaving(false);
      return;
    }

    setNote("");
    setSaving(false);
    onSuccess?.();
  }

  return (
    <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note, observation, or context…"
        rows={3}
      />

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setNote("")}
          disabled={saving}
        >
          Cancel
        </Button>

        <Button onClick={saveNote} disabled={saving}>
          {saving ? "Saving…" : "Save Note"}
        </Button>
      </div>
    </div>
  );
}
