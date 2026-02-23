"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import ZoneWeightBar from "./ZoneWeightBar";
import SpaceSensorPanel from "./SpaceSensorPanel";

// ── Types ──────────────────────────────────────────────────────────

interface SensorRow {
  id?: string;
  sensor_type: string;
  entity_id: string | null;
  weight: number;
  is_primary?: boolean;
  value: string | null;
  unit: string | null;
  last_seen_at: string | null;
  device_name: string | null;
  fresh?: boolean;
}

interface SpaceData {
  space_id: string;
  name: string;
  space_type: string;
  zone_weight: number | null;
  sensors: SensorRow[];
  computed_temp: number | null;
  temp_source: string;
}

interface ThermostatData {
  name: string;
  temp_f: number | null;
  humidity: number | null;
  last_synced: string | null;
}

interface ZoneData {
  hvac_zone_id: string;
  name: string;
  equipment_id: string | null;
  equipment_name: string | null;
  control_scope: string;
  zone_temp_source: string;
  profile_name: string | null;
  thermostat: ThermostatData | null;
  spaces: SpaceData[];
  computed_zone_temp: number | null;
}

interface AvailableEntity {
  entity_id: string;
  device_name: string | null;
  value: string | null;
  unit: string | null;
  bound: boolean;
}

interface ZoneConfigData {
  zones: ZoneData[];
  unassigned_spaces: { space_id: string; name: string; space_type: string }[];
  available_entities: {
    temperature: AvailableEntity[];
    humidity: AvailableEntity[];
    occupancy: AvailableEntity[];
  };
}

interface SpaceEdit {
  zone_weight: number | null;
  sensors: SensorRow[];
}

interface Props {
  siteId: string;
  orgId: string;
}

// ── Component ──────────────────────────────────────────────────────

export default function ZoneSpaceConfig({ siteId }: Props) {
  const [data, setData] = useState<ZoneConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Map<string, Map<string, SpaceEdit>>>(new Map());
  const [savingZone, setSavingZone] = useState<string | null>(null);
  const [savedZone, setSavedZone] = useState<string | null>(null);
  const [assigningSpace, setAssigningSpace] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/zone-config?site_id=${siteId}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch zone config:", err);
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Edit helpers ────────────────────────────────────────────────

  const getSpaceData = useCallback(
    (zoneId: string, space: SpaceData): SpaceData => {
      const zoneEdits = edits.get(zoneId);
      if (!zoneEdits) return space;
      const spaceEdit = zoneEdits.get(space.space_id);
      if (!spaceEdit) return space;
      return {
        ...space,
        zone_weight: spaceEdit.zone_weight,
        sensors: spaceEdit.sensors,
      };
    },
    [edits]
  );

  const setSpaceEdit = useCallback(
    (zoneId: string, spaceId: string, updater: (prev: SpaceEdit) => SpaceEdit, zone: ZoneData) => {
      setEdits((prev) => {
        const next = new Map(prev);
        const zoneEdits = new Map(next.get(zoneId) || new Map());
        const space = zone.spaces.find((s) => s.space_id === spaceId);
        const current = zoneEdits.get(spaceId) || {
          zone_weight: space?.zone_weight ?? null,
          sensors: space?.sensors ? JSON.parse(JSON.stringify(space.sensors)) : [],
        };
        zoneEdits.set(spaceId, updater(current));
        next.set(zoneId, zoneEdits);
        return next;
      });
    },
    []
  );

  const handleZoneWeightChange = useCallback(
    (zoneId: string, zone: ZoneData) => (spaceId: string, weight: number | null) => {
      setSpaceEdit(zoneId, spaceId, (prev) => ({ ...prev, zone_weight: weight }), zone);
    },
    [setSpaceEdit]
  );

  const handleSensorChange = useCallback(
    (zoneId: string, zone: ZoneData) => (spaceId: string, index: number, field: string, value: any) => {
      setSpaceEdit(
        zoneId,
        spaceId,
        (prev) => {
          const sensors = [...prev.sensors];
          sensors[index] = { ...sensors[index], [field]: value };
          return { ...prev, sensors };
        },
        zone
      );
    },
    [setSpaceEdit]
  );

  const handleAddSensor = useCallback(
    (zoneId: string, zone: ZoneData) => (spaceId: string, sensorType: string) => {
      setSpaceEdit(
        zoneId,
        spaceId,
        (prev) => {
          const sensors = [...prev.sensors];
          // Auto-distribute weights for temperature sensors
          if (sensorType === "temperature") {
            const existingTemp = sensors.filter((s) => s.sensor_type === "temperature");
            const newWeight = parseFloat((1 / (existingTemp.length + 1)).toFixed(2));
            // Redistribute existing temp sensor weights
            for (const s of sensors) {
              if (s.sensor_type === "temperature") {
                s.weight = newWeight;
              }
            }
            sensors.push({
              sensor_type: "temperature",
              entity_id: null,
              weight: newWeight,
              value: null,
              unit: null,
              last_seen_at: null,
              device_name: null,
            });
          } else {
            sensors.push({
              sensor_type: sensorType,
              entity_id: null,
              weight: 1.0,
              value: null,
              unit: null,
              last_seen_at: null,
              device_name: null,
            });
          }
          return { ...prev, sensors };
        },
        zone
      );
    },
    [setSpaceEdit]
  );

  const handleRemoveSensor = useCallback(
    (zoneId: string, zone: ZoneData) => (spaceId: string, index: number) => {
      setSpaceEdit(
        zoneId,
        spaceId,
        (prev) => {
          const sensors = prev.sensors.filter((_, i) => i !== index);
          // Auto-redistribute temp sensor weights
          const tempSensors = sensors.filter((s) => s.sensor_type === "temperature");
          if (tempSensors.length > 0) {
            const newWeight = parseFloat((1 / tempSensors.length).toFixed(2));
            for (const s of sensors) {
              if (s.sensor_type === "temperature") {
                s.weight = newWeight;
              }
            }
          }
          return { ...prev, sensors };
        },
        zone
      );
    },
    [setSpaceEdit]
  );

  const handleAutoDistribute = useCallback(
    (zoneId: string) => {
      if (!data) return;
      const zone = data.zones.find((z) => z.hvac_zone_id === zoneId);
      if (!zone || zone.spaces.length === 0) return;

      setEdits((prev) => {
        const next = new Map(prev);
        const zoneEdits = new Map(next.get(zoneId) || new Map());
        const evenZoneWeight = parseFloat((1 / zone.spaces.length).toFixed(2));

        for (const space of zone.spaces) {
          const current = zoneEdits.get(space.space_id) || {
            zone_weight: space.zone_weight,
            sensors: JSON.parse(JSON.stringify(space.sensors)),
          };
          const sensors = [...current.sensors];
          const tempSensors = sensors.filter((s) => s.sensor_type === "temperature");
          if (tempSensors.length > 0) {
            const evenSensorWeight = parseFloat((1 / tempSensors.length).toFixed(2));
            for (const s of sensors) {
              if (s.sensor_type === "temperature") s.weight = evenSensorWeight;
            }
          }
          zoneEdits.set(space.space_id, { zone_weight: evenZoneWeight, sensors });
        }

        next.set(zoneId, zoneEdits);
        return next;
      });
    },
    [data]
  );

  const handleSave = useCallback(
    async (zoneId: string) => {
      if (!data) return;
      const zone = data.zones.find((z) => z.hvac_zone_id === zoneId);
      if (!zone) return;
      const zoneEdits = edits.get(zoneId);
      if (!zoneEdits || zoneEdits.size === 0) return;

      setSavingZone(zoneId);
      try {
        const spaces = zone.spaces.map((sp) => {
          const edit = zoneEdits.get(sp.space_id);
          return {
            space_id: sp.space_id,
            zone_weight: edit?.zone_weight ?? sp.zone_weight,
            sensors: (edit?.sensors ?? sp.sensors).map((s) => ({
              id: s.id || undefined,
              sensor_type: s.sensor_type,
              entity_id: s.entity_id,
              weight: s.weight,
            })),
          };
        });

        const res = await fetch("/api/zone-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, hvac_zone_id: zoneId, spaces }),
        });

        if (res.ok) {
          setEdits((prev) => {
            const next = new Map(prev);
            next.delete(zoneId);
            return next;
          });
          setSavedZone(zoneId);
          setTimeout(() => setSavedZone(null), 2000);
          await fetchData();
        } else {
          const err = await res.json();
          alert(err.error || "Save failed");
        }
      } catch (err) {
        console.error("Save failed:", err);
        alert("Save failed");
      }
      setSavingZone(null);
    },
    [data, edits, siteId, fetchData]
  );

  const handleAssignSpace = useCallback(
    async (spaceId: string, equipmentId: string) => {
      setAssigningSpace(spaceId);
      try {
        await fetch("/api/zone-config/assign-space", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, space_id: spaceId, equipment_id: equipmentId }),
        });
        await fetchData();
      } catch (err) {
        console.error("Assign space failed:", err);
      }
      setAssigningSpace(null);
    },
    [siteId, fetchData]
  );

  const handleRemoveSpace = useCallback(
    async (spaceId: string) => {
      setAssigningSpace(spaceId);
      try {
        await fetch("/api/zone-config/assign-space", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, space_id: spaceId, equipment_id: null }),
        });
        await fetchData();
      } catch (err) {
        console.error("Remove space failed:", err);
      }
      setAssigningSpace(null);
    },
    [siteId, fetchData]
  );

  // ── Dirty detection ─────────────────────────────────────────────

  const isZoneDirty = useCallback(
    (zoneId: string) => {
      const zoneEdits = edits.get(zoneId);
      return zoneEdits != null && zoneEdits.size > 0;
    },
    [edits]
  );

  // Zone weight validation
  const zoneWeightStatus = useCallback(
    (zoneId: string, zone: ZoneData): { sum: number; valid: boolean } => {
      const spaces = zone.spaces.map((sp) => getSpaceData(zoneId, sp));
      const weights = spaces.filter((s) => s.zone_weight != null);
      if (weights.length === 0) return { sum: 0, valid: true };
      const sum = weights.reduce((acc, s) => acc + (s.zone_weight || 0), 0);
      return { sum, valid: Math.abs(sum - 1.0) < 0.01 };
    },
    [getSpaceData]
  );

  // ── Available equipment for assign dropdown ─────────────────────

  const zoneEquipments = useMemo(() => {
    if (!data) return [];
    return data.zones
      .filter((z) => z.equipment_id)
      .map((z) => ({ equipment_id: z.equipment_id!, name: z.name, equipment_name: z.equipment_name }));
  }, [data]);

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-sm text-gray-400 py-4">Loading zone configuration...</div>;
  }

  if (!data || data.zones.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {/* Section header */}
      <div
        className="px-4 py-3 border-b bg-gray-50 rounded-t-lg flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Zone & Space Configuration</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage sensors, weights, and space assignments for HVAC zones
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-400">
          {data.zones.length} zone{data.zones.length !== 1 ? "s" : ""}
        </span>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {data.zones.map((zone) => {
            const isExpanded = expandedZones.has(zone.hvac_zone_id);
            const dirty = isZoneDirty(zone.hvac_zone_id);
            const weightStatus = zoneWeightStatus(zone.hvac_zone_id, zone);

            return (
              <div key={zone.hvac_zone_id} className="border rounded-lg">
                {/* Zone header */}
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer select-none bg-gray-50/50 rounded-t-lg"
                  onClick={() =>
                    setExpandedZones((prev) => {
                      const next = new Set(prev);
                      if (next.has(zone.hvac_zone_id)) next.delete(zone.hvac_zone_id);
                      else next.add(zone.hvac_zone_id);
                      return next;
                    })
                  }
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{zone.name}</span>
                        {zone.equipment_name && (
                          <span className="text-xs text-gray-400">
                            Equipment: {zone.equipment_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                        {zone.profile_name && <span>Profile: {zone.profile_name}</span>}
                        <span>
                          Control:{" "}
                          <span className={zone.control_scope === "managed" ? "text-green-600 font-medium" : ""}>
                            {zone.control_scope === "managed" ? "Managed" : "Open"}
                          </span>
                        </span>
                        {zone.thermostat && (
                          <span>
                            Thermostat: {zone.thermostat.name}
                            {zone.thermostat.temp_f != null && ` (${zone.thermostat.temp_f}°F`}
                            {zone.thermostat.humidity != null && `, ${zone.thermostat.humidity}% RH`}
                            {zone.thermostat.temp_f != null && ")"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {zone.spaces.length} space{zone.spaces.length !== 1 ? "s" : ""}
                    </span>
                    {dirty && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        unsaved
                      </span>
                    )}
                  </div>
                </div>

                {/* Zone expanded content */}
                {isExpanded && (
                  <div className="px-4 py-3 space-y-3 border-t">
                    {zone.spaces.length > 0 ? (
                      <>
                        {/* Weight bar */}
                        <ZoneWeightBar
                          spaces={zone.spaces.map((sp) => {
                            const edited = getSpaceData(zone.hvac_zone_id, sp);
                            return {
                              name: edited.name,
                              zone_weight: edited.zone_weight,
                              computed_temp: edited.computed_temp,
                            };
                          })}
                        />

                        {/* Space panels */}
                        {zone.spaces.map((space) => (
                          <SpaceSensorPanel
                            key={space.space_id}
                            space={getSpaceData(zone.hvac_zone_id, space)}
                            availableEntities={data.available_entities}
                            thermostatTemp={zone.thermostat?.temp_f ?? null}
                            onZoneWeightChange={handleZoneWeightChange(zone.hvac_zone_id, zone)}
                            onSensorChange={handleSensorChange(zone.hvac_zone_id, zone)}
                            onAddSensor={handleAddSensor(zone.hvac_zone_id, zone)}
                            onRemoveSensor={handleRemoveSensor(zone.hvac_zone_id, zone)}
                          />
                        ))}

                        {/* Zone footer: computed temp, weight validation, actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                          <div className="flex items-center gap-4 text-xs">
                            {zone.computed_zone_temp != null && (
                              <span className="text-gray-600">
                                Zone Temp: <span className="font-mono font-medium">{zone.computed_zone_temp}°F</span>
                                <span className="text-gray-400 ml-1">(weighted avg)</span>
                              </span>
                            )}
                            {weightStatus.sum > 0 && (
                              <span className={weightStatus.valid ? "text-green-600" : "text-amber-600"}>
                                Zone Weights: {(weightStatus.sum * 100).toFixed(0)}%
                                {weightStatus.valid ? " \u2713" : " — should total 100%"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoDistribute(zone.hvac_zone_id);
                              }}
                              className="px-3 py-1 rounded text-xs border text-gray-600 hover:bg-gray-50"
                            >
                              Auto-Distribute
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSave(zone.hvac_zone_id);
                              }}
                              disabled={!dirty || savingZone === zone.hvac_zone_id}
                              className={`px-3 py-1 rounded text-xs font-medium ${
                                savedZone === zone.hvac_zone_id
                                  ? "bg-green-100 text-green-700"
                                  : dirty
                                  ? "bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white hover:opacity-90"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                              } disabled:opacity-50`}
                            >
                              {savingZone === zone.hvac_zone_id
                                ? "Saving..."
                                : savedZone === zone.hvac_zone_id
                                ? "Saved!"
                                : "Save"}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-400 italic py-2">
                        No spaces assigned to this zone.
                      </div>
                    )}

                    {/* Assign space button */}
                    {data.unassigned_spaces.length > 0 && zone.equipment_id && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-gray-400">Assign space:</span>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignSpace(e.target.value, zone.equipment_id!);
                            }
                          }}
                          disabled={assigningSpace != null}
                          className="border rounded px-2 py-1 text-xs bg-white"
                        >
                          <option value="">+ Add space...</option>
                          {data.unassigned_spaces.map((sp) => (
                            <option key={sp.space_id} value={sp.space_id}>
                              {sp.name} ({sp.space_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Remove space buttons */}
                    {zone.spaces.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {zone.spaces.map((sp) => (
                          <button
                            key={sp.space_id}
                            onClick={() => handleRemoveSpace(sp.space_id)}
                            disabled={assigningSpace === sp.space_id}
                            className="text-[10px] px-2 py-0.5 rounded border text-gray-400 hover:text-red-500 hover:border-red-300 disabled:opacity-50"
                            title={`Remove ${sp.name} from zone`}
                          >
                            {sp.name} &times;
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned spaces */}
          {data.unassigned_spaces.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Unassigned Spaces
              </div>
              <div className="flex flex-wrap gap-2">
                {data.unassigned_spaces.map((sp) => (
                  <span
                    key={sp.space_id}
                    className="px-2 py-1 rounded bg-gray-100 text-xs text-gray-500"
                  >
                    {sp.name} ({sp.space_type})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
