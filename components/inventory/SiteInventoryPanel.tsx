"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface InventorySpace {
  space_id: string;
  name: string;
}

export default function SiteInventoryPanel({ siteId }: { siteId: string }) {
  const [spaces, setSpaces] = useState<InventorySpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const loadSpaces = useCallback(async () => {
    const { data } = await supabase
      .from("a_spaces")
      .select("space_id, name")
      .eq("site_id", siteId)
      .eq("space_type", "inventory_storage")
      .neq("name", "Unassigned")
      .order("name");

    setSpaces(data || []);
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  return (
    <div className="bg-white/95 rounded-md shadow p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-gray-800">Inventory Spaces</div>
        <button
          onClick={() => setShowAdd(true)}
          className="text-green-700 hover:text-green-900 font-semibold text-xs"
        >
          + Add
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 italic">Loading...</div>
      ) : spaces.length === 0 ? (
        <div className="text-gray-400 italic">No inventory spaces</div>
      ) : (
        <div className="max-h-28 overflow-y-auto space-y-1">
          {spaces.map((space) => (
            <div key={space.space_id} className="flex items-center justify-between">
              <Link
                href={`/sites/${siteId}/spaces/${space.space_id}`}
                className="text-blue-600 hover:text-blue-800 hover:underline truncate"
              >
                {space.name}
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Inline Add Space */}
      {showAdd && (
        <AddSpaceInline
          siteId={siteId}
          existingNames={spaces.map((s) => s.name)}
          onClose={() => setShowAdd(false)}
          onSaved={loadSpaces}
        />
      )}
    </div>
  );
}

// ─── Inline Add Space Form ─────────────────────────────────

function AddSpaceInline({
  siteId,
  existingNames,
  onClose,
  onSaved,
}: {
  siteId: string;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (name && existingNames.includes(name)) {
      setError("Name already exists");
    } else {
      setError("");
    }
  }, [name, existingNames]);

  const handleSave = async () => {
    if (!name.trim() || error) return;
    setSaving(true);

    const { error: insertError } = await supabase.from("a_spaces").insert({
      site_id: siteId,
      name: name.trim(),
      space_type: "inventory_storage",
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("Name already exists");
      } else {
        setError(insertError.message);
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose();
    onSaved();
  };

  return (
    <div className="mt-2 border-t pt-2 space-y-2">
      <div>
        <Label className="text-xs font-medium">Space Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Back Room, Roof Storage"
          className="h-7 text-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onClose();
          }}
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !name.trim() || !!error}
          className="h-6 px-2 text-xs bg-green-600 text-white hover:bg-green-700"
        >
          {saving ? "..." : "Add"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="h-6 px-2 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
