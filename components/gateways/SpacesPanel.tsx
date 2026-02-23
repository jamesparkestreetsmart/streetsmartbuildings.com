"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { ChevronDown, ChevronRight, MapPin, Plus, X, Cloud } from "lucide-react";

/* ======================================================
 Types
====================================================== */

interface SensorMapping {
  id: number;
  sensor_type: string;
  entity_id: string;
  weight: number;
  is_primary: boolean;
}

interface Requirement {
  sensor_role: string;
  sensor_type: string;
  required: boolean;
}

interface SpaceRow {
  space_id: string;
  name: string;
  space_type: string;
  hvac_zone_name: string | null;
  device_count: number;
  equipment_count: number;
  required_count: number;
  total_requirements: number;
  mapped_count: number;
  mapped_required_count: number;
  mapped_roles: string[];
  missing_required_roles: string[];
  sensors: SensorMapping[];
  requirements: Requirement[];
}

interface AvailableEntity {
  entity_id: string;
  friendly_name: string;
  last_state: string | null;
  last_seen_at: string | null;
}

/* ======================================================
 Sensor Section Editor
====================================================== */

interface SensorSectionProps {
  label: string;
  sensorType: string;
  required: boolean;
  sensors: SensorMapping[];
  availableEntities: AvailableEntity[];
  onAdd: (sensorType: string, entityId: string) => void;
  onRemove: (id: number) => void;
  onWeightChange: (id: number, weight: number) => void;
}

function SensorSection({
  label,
  sensorType,
  required,
  sensors,
  availableEntities,
  onAdd,
  onRemove,
  onWeightChange,
}: SensorSectionProps) {
  const [addingEntityId, setAddingEntityId] = useState("");

  const filteredSensors = sensors.filter((s) => s.sensor_type === sensorType);
  const usedEntityIds = new Set(filteredSensors.map((s) => s.entity_id));
  const unusedEntities = availableEntities.filter((e) => !usedEntityIds.has(e.entity_id));

  const handleAdd = () => {
    if (!addingEntityId) return;
    onAdd(sensorType, addingEntityId);
    setAddingEntityId("");
  };

  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        {required && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
            Required
          </span>
        )}
        <span className="text-[10px] text-slate-500">
          {filteredSensors.length}/5
        </span>
      </div>

      {/* Existing mapped sensors */}
      {filteredSensors.map((sensor, idx) => {
        const entity = availableEntities.find((e) => e.entity_id === sensor.entity_id);
        return (
          <div
            key={sensor.id}
            className="flex items-center gap-2 mb-1.5 bg-slate-800/50 rounded px-2 py-1.5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-200 truncate">
                {entity?.friendly_name || sensor.entity_id}
              </div>
              {entity?.last_state && (
                <div className="text-[10px] text-slate-500">
                  {entity.last_state}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {idx === 0 && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  Primary
                </span>
              )}
              <label className="text-[10px] text-slate-500 flex items-center gap-1">
                W:
                <input
                  type="number"
                  min={0.1}
                  max={1.0}
                  step={0.1}
                  value={sensor.weight}
                  onChange={(e) => onWeightChange(sensor.id, parseFloat(e.target.value) || 1.0)}
                  className="w-12 bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-[10px] text-slate-300 text-center"
                />
              </label>
              <button
                onClick={() => onRemove(sensor.id)}
                className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                title="Remove sensor"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add new sensor */}
      {filteredSensors.length < 5 && (
        <div className="flex items-center gap-1.5 mt-1">
          <select
            value={addingEntityId}
            onChange={(e) => setAddingEntityId(e.target.value)}
            className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-300 min-w-0"
          >
            <option value="">--- select entity ---</option>
            {unusedEntities.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>
                {e.friendly_name || e.entity_id}
                {e.last_state ? ` (${e.last_state})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!addingEntityId}
            className="flex items-center gap-0.5 px-2 py-1 text-[10px] rounded bg-slate-700 border border-slate-600 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      )}

      {filteredSensors.length === 0 && unusedEntities.length === 0 && (
        <div className="text-[10px] text-slate-600 italic">No entities available</div>
      )}
    </div>
  );
}

/* ======================================================
 Outdoor Badge
====================================================== */

function OutdoorBadge() {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded px-3 py-2 w-fit">
        <Cloud className="w-4 h-4 text-sky-400" />
        <span className="text-xs text-sky-300 font-medium">Auto: Weather API</span>
        <span className="text-[10px] text-slate-500 ml-1">
          Temperature, humidity, and lux sourced from log_weathers
        </span>
      </div>
    </div>
  );
}

/* ======================================================
 Main Component
====================================================== */

interface Props {
  siteId: string;
}

export default function SpacesPanel({ siteId }: Props) {
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [availTemp, setAvailTemp] = useState<AvailableEntity[]>([]);
  const [availHumidity, setAvailHumidity] = useState<AvailableEntity[]>([]);
  const [availMotion, setAvailMotion] = useState<AvailableEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());

  const apiBase = `/api/sites/${siteId}/spaces-summary`;

  const fetchSpaces = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSpaces(data.spaces || []);
      setAvailTemp(data.available_temp_entities || []);
      setAvailHumidity(data.available_humidity_entities || []);
      setAvailMotion(data.available_motion_entities || []);
    } catch (err) {
      console.error("Failed to fetch spaces:", err);
    }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  };

  const handleAdd = async (spaceId: string, sensorType: string, entityId: string) => {
    const space = spaces.find((s) => s.space_id === spaceId);
    if (!space) return;

    const existingOfType = space.sensors.filter((s) => s.sensor_type === sensorType);
    const isPrimary = existingOfType.length === 0;

    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space_id: spaceId,
          sensor_type: sensorType,
          entity_id: entityId,
          weight: 1.0,
          is_primary: isPrimary,
        }),
      });
      if (!res.ok) throw new Error("Failed to add sensor");
      await fetchSpaces();
    } catch (err) {
      console.error("Failed to add sensor:", err);
    }
    setSaving(false);
  };

  const handleRemove = async (sensorId: number) => {
    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sensorId }),
      });
      if (!res.ok) throw new Error("Failed to remove sensor");
      await fetchSpaces();
    } catch (err) {
      console.error("Failed to remove sensor:", err);
    }
    setSaving(false);
  };

  const handleWeightChange = async (sensorId: number, weight: number) => {
    const clamped = Math.min(1.0, Math.max(0.1, weight));
    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sensorId, weight: clamped }),
      });
      if (!res.ok) throw new Error("Failed to update weight");
      await fetchSpaces();
    } catch (err) {
      console.error("Failed to update weight:", err);
    }
    setSaving(false);
  };

  const fullyMappedCount = spaces.filter(
    (s) => s.required_count > 0 && s.mapped_required_count === s.required_count
  ).length;

  const getSensorSections = (space: SpaceRow) => {
    return [
      {
        label: "Temperature",
        sensorType: "temperature",
        required: space.requirements.some(
          (r) => (r.sensor_type === "temperature" || r.sensor_type === "air_temperature") && r.required
        ),
        entities: availTemp,
      },
      {
        label: "Humidity",
        sensorType: "humidity",
        required: space.requirements.some((r) => r.sensor_type === "humidity" && r.required),
        entities: availHumidity,
      },
      {
        label: "Motion / Occupancy",
        sensorType: "motion_detected",
        required: space.requirements.some((r) => r.sensor_type === "motion_detected" && r.required),
        entities: availMotion,
      },
    ];
  };

  if (!loading && spaces.length === 0) return null;

  return (
    <div className="bg-slate-900 text-white rounded overflow-hidden">
      {/* Panel Header */}
      <div
        className="bg-slate-800 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
            <MapPin className="w-4 h-4 text-purple-400" />
            <div>
              <h2 className="text-sm font-semibold">Spaces on this Site</h2>
              <p className="text-xs text-slate-400">
                Assign sensors and devices to physical spaces
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {saving && (
              <span className="text-blue-400 animate-pulse">Saving...</span>
            )}
            <span className="text-slate-400">
              {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
            </span>
            <span className="text-emerald-400">
              {fullyMappedCount} fully mapped
            </span>
            {spaces.length - fullyMappedCount > 0 && (
              <span className="text-amber-400">
                {spaces.length - fullyMappedCount} incomplete
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Panel Body */}
      {expanded && (
        <div>
          {loading ? (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">
              Loading spaces...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800/50 text-slate-400">
                    <th className="px-4 py-2 text-left font-medium w-8"></th>
                    <th className="px-2 py-2 text-left font-medium">Space Name</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">HVAC Zone</th>
                    <th className="px-3 py-2 text-center font-medium">Devices</th>
                    <th className="px-3 py-2 text-center font-medium">Equipment</th>
                    <th className="px-3 py-2 text-left font-medium">Sensors</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((space) => {
                    const isExpanded = expandedSpaces.has(space.space_id);
                    const isOutdoor = space.space_type === "outdoor";
                    const allMapped =
                      space.required_count > 0 &&
                      space.mapped_required_count === space.required_count;
                    const partiallyMapped = space.mapped_required_count > 0;
                    const noRequirements = space.required_count === 0;

                    const sensorColorClass = noRequirements
                      ? "text-slate-500"
                      : allMapped
                        ? "text-emerald-400"
                        : partiallyMapped
                          ? "text-amber-400"
                          : "text-red-400";

                    const dotColorClass = noRequirements
                      ? "bg-slate-500"
                      : allMapped
                        ? "bg-emerald-400"
                        : partiallyMapped
                          ? "bg-amber-400"
                          : "bg-red-400";

                    return (
                      <Fragment key={space.space_id}>
                        {/* Main clickable row */}
                        <tr
                          className={`border-t border-slate-700/50 cursor-pointer hover:bg-slate-800/30 transition-colors ${
                            isExpanded ? "bg-slate-800/40" : ""
                          }`}
                          onClick={() => toggleSpace(space.space_id)}
                        >
                          <td className="px-4 py-2">
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-500" />
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-200 font-medium">
                            {space.name}
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            {space.space_type || "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {space.hvac_zone_name || (
                              <span className="text-slate-500">{"\u2014"}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-300">
                            {space.device_count > 0 ? (
                              space.device_count
                            ) : (
                              <span className="text-slate-500">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-300">
                            {space.equipment_count > 0 ? (
                              space.equipment_count
                            ) : (
                              <span className="text-slate-500">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isOutdoor ? (
                              <div className="flex items-center gap-1">
                                <Cloud className="w-3 h-3 text-sky-400" />
                                <span className="text-sky-400 text-[10px]">Weather API</span>
                              </div>
                            ) : space.required_count > 0 ? (
                              <div>
                                <span className={sensorColorClass}>
                                  {space.mapped_required_count}/{space.required_count} required
                                </span>
                                {space.mapped_roles.length > 0 && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {space.mapped_roles.join(", ")}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500">No requirements</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isOutdoor ? (
                              <span
                                className="inline-block w-2 h-2 rounded-full bg-sky-400"
                                title="Outdoor: Weather API"
                              />
                            ) : (
                              <span
                                className={`inline-block w-2 h-2 rounded-full ${dotColorClass}`}
                                title={
                                  space.missing_required_roles.length > 0
                                    ? `Missing: ${space.missing_required_roles.join(", ")}`
                                    : allMapped
                                      ? "All required sensors mapped"
                                      : noRequirements
                                        ? "No sensor requirements for this space type"
                                        : undefined
                                }
                              />
                            )}
                          </td>
                        </tr>

                        {/* Expanded sensor editor row */}
                        {isExpanded && (
                          <tr className="bg-slate-900/50">
                            <td colSpan={8} className="p-0">
                              <div className="border-t border-slate-700/30">
                                {isOutdoor ? (
                                  <OutdoorBadge />
                                ) : (
                                  <div className="px-6 py-4">
                                    <div className="flex gap-6 flex-wrap">
                                      {getSensorSections(space).map((section) => (
                                        <SensorSection
                                          key={section.sensorType}
                                          label={section.label}
                                          sensorType={section.sensorType}
                                          required={section.required}
                                          sensors={space.sensors}
                                          availableEntities={section.entities}
                                          onAdd={(st, eid) => handleAdd(space.space_id, st, eid)}
                                          onRemove={handleRemove}
                                          onWeightChange={handleWeightChange}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
