"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface SpaceSensor {
  id: string;
  sensor_type: string;
  entity_id: string | null;
  weight: number;
  is_primary: boolean;
  value: string | null;
  unit: string | null;
  fresh: boolean;
}

interface SpaceData {
  space_id: string;
  name: string;
  space_type: string;
  equipment_id: string | null;
  equipment_name: string | null;
  sensors: SpaceSensor[];
}

interface ZoneData {
  hvac_zone_id: string;
  name: string;
  equipment_id: string | null;
  equipment_name: string | null;
  thermostat_device_id: string | null;
  control_scope: string;
  zone_temp_source: string;
}

interface TempEntity {
  entity_id: string;
  device_name: string | null;
  value: string | null;
  unit: string | null;
}

interface Props {
  siteId: string;
}

// ── Component ──────────────────────────────────────────────────────

export default function SpaceSensorConfig({ siteId }: Props) {
  const [spaces, setSpaces] = useState<SpaceData[]>([]);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [availableEntities, setAvailableEntities] = useState<TempEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local edits: space_id → { entity_id, weight }
  const [edits, setEdits] = useState<Map<string, { entity_id: string | null; weight: number }>>(new Map());
  // Zone temp source edits: zone_id → source
  const [zoneSourceEdits, setZoneSourceEdits] = useState<Map<string, string>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gateways/spaces?site_id=${siteId}`);
      const data = await res.json();
      setSpaces(data.spaces || []);
      setZones(data.zones || []);
      setAvailableEntities(data.available_temp_entities || []);
    } catch (err) {
      console.error("Failed to fetch space data:", err);
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group spaces by zone (via equipment_id)
  const getZoneSpaces = (zone: ZoneData) => {
    return spaces.filter((s) => s.equipment_id === zone.equipment_id);
  };

  const unservedSpaces = spaces.filter(
    (s) => !zones.some((z) => z.equipment_id === s.equipment_id)
  );

  // Handle entity assignment change
  const handleEntityChange = (spaceId: string, entityId: string | null) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(spaceId) || { entity_id: null, weight: 1.0 };
      next.set(spaceId, { ...existing, entity_id: entityId || null });
      return next;
    });
  };

  // Handle weight change
  const handleWeightChange = (spaceId: string, weight: number) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(spaceId) || { entity_id: null, weight: 1.0 };
      next.set(spaceId, { ...existing, weight });
      return next;
    });
  };

  // Handle zone temp source change
  const handleZoneSourceChange = (zoneId: string, source: string) => {
    setZoneSourceEdits((prev) => {
      const next = new Map(prev);
      next.set(zoneId, source);
      return next;
    });
  };

  // Get current value for a space (edit or existing)
  const getSpaceEntity = (space: SpaceData): string | null => {
    const edit = edits.get(space.space_id);
    if (edit !== undefined) return edit.entity_id;
    const tempSensor = space.sensors.find((s) => s.sensor_type === "temperature");
    return tempSensor?.entity_id || null;
  };

  const getSpaceWeight = (space: SpaceData): number => {
    const edit = edits.get(space.space_id);
    if (edit !== undefined) return edit.weight;
    const tempSensor = space.sensors.find((s) => s.sensor_type === "temperature");
    return tempSensor?.weight ?? 1.0;
  };

  const getZoneSource = (zone: ZoneData): string => {
    return zoneSourceEdits.get(zone.hvac_zone_id) ?? zone.zone_temp_source;
  };

  const hasChanges = edits.size > 0 || zoneSourceEdits.size > 0;

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    try {
      // Build assignments from edits
      const assignments = Array.from(edits.entries()).map(([space_id, { entity_id, weight }]) => ({
        space_id,
        sensor_type: "temperature",
        entity_id,
        weight,
      }));

      // Save each zone source change
      for (const [zone_id, zone_temp_source] of zoneSourceEdits.entries()) {
        await fetch("/api/gateways/spaces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, zone_id, zone_temp_source }),
        });
      }

      // Save sensor assignments
      if (assignments.length > 0) {
        await fetch("/api/gateways/spaces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, assignments }),
        });
      }

      setEdits(new Map());
      setZoneSourceEdits(new Map());
      await fetchData();
    } catch (err) {
      console.error("Failed to save:", err);
    }
    setSaving(false);
  };

  // All available entities: existing assigned + available pool
  const allEntities = [
    ...availableEntities,
    // Include currently assigned entities so they appear in the dropdown
    ...spaces.flatMap((s) =>
      s.sensors
        .filter((sen) => sen.sensor_type === "temperature" && sen.entity_id)
        .map((sen) => ({
          entity_id: sen.entity_id!,
          device_name: null,
          value: sen.value,
          unit: sen.unit,
        }))
    ),
  ];
  // Dedupe
  const entityOptions = Array.from(
    new Map(allEntities.map((e) => [e.entity_id, e])).values()
  );

  if (loading) {
    return <div className="text-sm text-gray-400 py-4">Loading space configuration...</div>;
  }

  if (zones.length === 0) {
    return null; // No zones → don't show section
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">HVAC Zones & Space Sensor Configuration</h3>
          <p className="text-xs text-gray-500 mt-0.5">Assign temperature sensors to spaces and configure zone averaging</p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        {zones.map((zone) => {
          const zoneSpaces = getZoneSpaces(zone);
          const zoneSource = getZoneSource(zone);

          // Calculate total weight for this zone's spaces
          const totalWeight = zoneSpaces.reduce((sum, sp) => sum + getSpaceWeight(sp), 0);

          return (
            <div key={zone.hvac_zone_id} className="border rounded-lg p-4">
              {/* Zone header */}
              <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Zone: {zone.name}</div>
                  <div className="text-xs text-gray-500">
                    Equipment: {zone.equipment_name || "—"}
                    {" | "}Control: <span className={zone.control_scope === "managed" ? "text-green-600 font-medium" : "text-gray-600"}>
                      {zone.control_scope === "managed" ? "Managed" : "Open"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Zone Temp Source:</label>
                  <select
                    value={zoneSource}
                    onChange={(e) => handleZoneSourceChange(zone.hvac_zone_id, e.target.value)}
                    className="border rounded px-2 py-1 text-xs bg-white"
                  >
                    <option value="thermostat_builtin">Thermostat Builtin</option>
                    <option value="space_weighted_avg">Space Weighted Avg</option>
                  </select>
                </div>
              </div>

              {/* Served spaces table */}
              {zoneSpaces.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No spaces assigned to this zone's equipment.</p>
              ) : (
                <>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Space</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Temp Sensor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500 w-20">Weight</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Reading</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {zoneSpaces.map((space) => {
                          const currentEntity = getSpaceEntity(space);
                          const currentWeight = getSpaceWeight(space);
                          const tempSensor = space.sensors.find((s) => s.sensor_type === "temperature");

                          return (
                            <tr key={space.space_id}>
                              <td className="px-3 py-2 text-gray-800 font-medium">{space.name}</td>
                              <td className="px-3 py-2 text-gray-500">{space.space_type}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={currentEntity || ""}
                                  onChange={(e) => handleEntityChange(space.space_id, e.target.value || null)}
                                  className="border rounded px-2 py-1 text-xs bg-white w-full max-w-[220px]"
                                >
                                  <option value="">— none —</option>
                                  {entityOptions.map((e) => (
                                    <option key={e.entity_id} value={e.entity_id}>
                                      {e.entity_id.replace(/^sensor\./, "")}
                                      {e.value ? ` (${e.value}${e.unit ? ` ${e.unit}` : ""})` : ""}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={currentWeight}
                                  onChange={(e) => handleWeightChange(space.space_id, parseFloat(e.target.value) || 0)}
                                  className="border rounded px-2 py-1 text-xs w-16 text-center"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-gray-700">
                                {tempSensor?.value
                                  ? `${tempSensor.value}${tempSensor.unit ? ` ${tempSensor.unit}` : ""}`
                                  : "—"}
                                {tempSensor?.fresh !== undefined && tempSensor.value && (
                                  <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full ${
                                    tempSensor.fresh ? "bg-green-500" : "bg-red-500"
                                  }`} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {zoneSource === "space_weighted_avg" && (
                    <div className={`text-xs mt-2 ${
                      Math.abs(totalWeight - 1.0) < 0.01 ? "text-green-600" : "text-amber-600"
                    }`}>
                      Total weight: {(totalWeight * 100).toFixed(0)}%
                      {Math.abs(totalWeight - 1.0) >= 0.01 && " — should total 100%"}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Unserved spaces */}
        {unservedSpaces.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Unserved Spaces (no HVAC zone)
            </div>
            <div className="flex flex-wrap gap-2">
              {unservedSpaces.map((sp) => (
                <span key={sp.space_id} className="px-2 py-1 rounded bg-gray-100 text-xs text-gray-500">
                  {sp.name} ({sp.space_type})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
