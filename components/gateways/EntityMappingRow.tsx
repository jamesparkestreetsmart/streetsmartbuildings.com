"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "../ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";

export default function EntityMappingRow({ row, siteid }: any) {
  const [equipments, setEquipments] = useState<any[]>([]);
  const [sensorTypes, setSensorTypes] = useState<any[]>([]);
  const [selectedEq, setSelectedEq] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // -----------------------
  // Load equipment + sensor library
  // -----------------------
  useEffect(() => {
    (async () => {
      const { data: eq } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name")
        .eq("site_id", siteid)
        .order("equipment_name");

      setEquipments(eq || []);

      const { data: st } = await supabase
        .from("library_sensor_type_mapping")
        .select("sensor_type")
        .order("sensor_type");

      setSensorTypes(st || []);
    })();
  }, [siteid]);

  // -----------------------
  // Suggested equipment based on fuzzy match
  // -----------------------
  const suggestedEquipment = useMemo(() => {
    if (!equipments.length) return null;

    const entityName = row.gr_device_name?.toLowerCase() ?? "";

    let scores = equipments.map((eq) => ({
      ...eq,
      score: similarity(entityName, eq.equipment_name.toLowerCase()),
    }));

    scores.sort((a, b) => b.score - a.score);

    return scores[0]?.equipment_id || null;
  }, [equipments, row]);

  // auto-select the suggestion if none chosen
  useEffect(() => {
    if (!selectedEq && suggestedEquipment) {
      setSelectedEq(suggestedEquipment);
    }
  }, [suggestedEquipment, selectedEq]);

  // -----------------------
  // Save Mapping
  // -----------------------
  const handleSave = async () => {
    if (!selectedEq || !selectedType) return;

    setSaving(true);

    await fetch(`/api/sites/${siteid}/map-entity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipment_id: selectedEq,
        ha_entity_id: row.ha_device_id,
        sensor_type: selectedType,
      }),
    });

    setSaving(false);
  };

  return (
    <div className="border-b py-4">
      {/* Header */}
      <p className="font-medium">{row.gr_device_name ?? row.ha_device_id}</p>
      <p className="text-xs text-gray-500 mb-3">{row.ha_device_id}</p>

      <div className="flex flex-col md:flex-row gap-3">

        {/* Equipment dropdown */}
        <Select value={selectedEq} onValueChange={setSelectedEq}>
          <SelectTrigger className="w-full md:w-80">
            <SelectValue placeholder="Select equipment…" />
          </SelectTrigger>
          <SelectContent>
            {equipments.map((e) => (
              <SelectItem key={e.equipment_id} value={e.equipment_id}>
                {e.equipment_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sensor type dropdown */}
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="Sensor type…" />
          </SelectTrigger>
          <SelectContent>
            {sensorTypes.map((t) => (
              <SelectItem key={t.sensor_type} value={t.sensor_type}>
                {t.sensor_type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleSave}
          disabled={saving || !selectedEq || !selectedType}
        >
          {saving ? "Saving…" : "Save Mapping"}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// BASIC SIMILARITY SCORING FUNCTION (0–1)
// ----------------------------------------------------
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;

  let matches = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) matches++;
  }

  return matches / len;
}
