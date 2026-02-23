"use client";

import { X, Plus } from "lucide-react";

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

interface AvailableEntity {
  entity_id: string;
  device_name: string | null;
  value: string | null;
  unit: string | null;
  bound: boolean;
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

interface Props {
  space: SpaceData;
  availableEntities: {
    temperature: AvailableEntity[];
    humidity: AvailableEntity[];
    occupancy: AvailableEntity[];
  };
  thermostatTemp: number | null;
  onZoneWeightChange: (spaceId: string, weight: number | null) => void;
  onSensorChange: (spaceId: string, index: number, field: string, value: any) => void;
  onAddSensor: (spaceId: string, sensorType: string) => void;
  onRemoveSensor: (spaceId: string, index: number) => void;
}

function freshnessClass(lastSeen: string | null): string {
  if (!lastSeen) return "bg-gray-300";
  const ageMin = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (ageMin < 10) return "bg-green-500";
  if (ageMin < 30) return "bg-yellow-500";
  return "bg-red-500";
}

function formatReading(value: string | null, unit: string | null): string {
  if (!value || value === "unknown" || value === "unavailable") return "—";
  return unit ? `${value} ${unit}` : value;
}

export default function SpaceSensorPanel({
  space,
  availableEntities,
  thermostatTemp,
  onZoneWeightChange,
  onSensorChange,
  onAddSensor,
  onRemoveSensor,
}: Props) {
  const tempSensors = space.sensors.filter((s) => s.sensor_type === "temperature");
  const otherSensors = space.sensors.filter((s) => s.sensor_type !== "temperature");
  const tempWeightSum = tempSensors.reduce((sum, s) => sum + (s.weight || 0), 0);

  // Filter available entities: include currently-assigned in this space's dropdown, exclude from others
  const getEntityOptions = (sensorType: string, currentEntityId: string | null) => {
    const pool =
      sensorType === "temperature" ? availableEntities.temperature :
      sensorType === "humidity" ? availableEntities.humidity :
      availableEntities.occupancy;

    return pool.filter((e) => !e.bound || e.entity_id === currentEntityId);
  };

  return (
    <div className="border rounded-lg p-3 bg-gray-50/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{space.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 uppercase">
            {space.space_type}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-gray-500">Zone Weight:</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={space.zone_weight ?? ""}
              placeholder="—"
              onChange={(e) => {
                const val = e.target.value;
                onZoneWeightChange(space.space_id, val === "" ? null : parseFloat(val));
              }}
              className="w-16 border rounded px-1.5 py-0.5 text-xs text-center"
            />
          </div>
          {space.computed_temp != null && (
            <span className="text-xs font-mono text-gray-600">
              Computed: {space.computed_temp}°F
            </span>
          )}
        </div>
      </div>

      {/* Temperature sensors */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Temperature Sensors</span>
          <button
            onClick={() => onAddSensor(space.space_id, "temperature")}
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {tempSensors.length > 0 ? (
          <div className="border rounded overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500">Entity</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 w-16">Weight</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 w-20">Reading</th>
                  <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-8"></th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tempSensors.map((sensor, idx) => {
                  const globalIdx = space.sensors.indexOf(sensor);
                  const options = getEntityOptions("temperature", sensor.entity_id);
                  return (
                    <tr key={sensor.id || idx}>
                      <td className="px-2 py-1.5">
                        <select
                          value={sensor.entity_id || ""}
                          onChange={(e) => onSensorChange(space.space_id, globalIdx, "entity_id", e.target.value || null)}
                          className="border rounded px-1.5 py-0.5 text-xs bg-white w-full max-w-[240px]"
                        >
                          <option value="">— select —</option>
                          {options.map((e) => (
                            <option key={e.entity_id} value={e.entity_id}>
                              {e.entity_id.replace(/^sensor\./, "")}
                              {e.value ? ` (${e.value}${e.unit ? ` ${e.unit}` : ""})` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={sensor.weight}
                          onChange={(e) => onSensorChange(space.space_id, globalIdx, "weight", parseFloat(e.target.value) || 0)}
                          className="w-14 border rounded px-1 py-0.5 text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-gray-700">
                        {formatReading(sensor.value, sensor.unit)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className={`w-2 h-2 rounded-full inline-block ${freshnessClass(sensor.last_seen_at)}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => onRemoveSensor(space.space_id, globalIdx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={`px-2 py-1 text-[10px] border-t ${
              tempSensors.length > 0 && Math.abs(tempWeightSum - 1.0) < 0.01
                ? "text-green-600"
                : "text-amber-600"
            }`}>
              Weight total: {(tempWeightSum * 100).toFixed(0)}%
              {Math.abs(tempWeightSum - 1.0) < 0.01 ? " \u2713" : " — should total 100%"}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 italic py-1">
            {thermostatTemp != null
              ? `Using thermostat fallback: ${thermostatTemp}°F`
              : "No temperature sensors assigned"}
          </div>
        )}
      </div>

      {/* Other sensors */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Other Sensors</span>
          <button
            onClick={() => onAddSensor(space.space_id, "humidity")}
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {otherSensors.length > 0 ? (
          <div className="border rounded overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 w-24">Type</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500">Entity</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 w-20">Reading</th>
                  <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-8"></th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {otherSensors.map((sensor, idx) => {
                  const globalIdx = space.sensors.indexOf(sensor);
                  const options = getEntityOptions(sensor.sensor_type, sensor.entity_id);
                  return (
                    <tr key={sensor.id || idx}>
                      <td className="px-2 py-1.5">
                        <select
                          value={sensor.sensor_type}
                          onChange={(e) => onSensorChange(space.space_id, globalIdx, "sensor_type", e.target.value)}
                          className="border rounded px-1 py-0.5 text-xs bg-white"
                        >
                          <option value="humidity">humidity</option>
                          <option value="occupancy">occupancy</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={sensor.entity_id || ""}
                          onChange={(e) => onSensorChange(space.space_id, globalIdx, "entity_id", e.target.value || null)}
                          className="border rounded px-1.5 py-0.5 text-xs bg-white w-full max-w-[240px]"
                        >
                          <option value="">— select —</option>
                          {options.map((e) => (
                            <option key={e.entity_id} value={e.entity_id}>
                              {e.entity_id.replace(/^(sensor|binary_sensor)\./, "")}
                              {e.value ? ` (${e.value}${e.unit ? ` ${e.unit}` : ""})` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-gray-700">
                        {formatReading(sensor.value, sensor.unit)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className={`w-2 h-2 rounded-full inline-block ${freshnessClass(sensor.last_seen_at)}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => onRemoveSensor(space.space_id, globalIdx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 italic py-1">No other sensors</div>
        )}
      </div>
    </div>
  );
}
