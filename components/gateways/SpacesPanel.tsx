"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, MapPin, Cloud } from "lucide-react";

/* ======================================================
 Types
====================================================== */

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
}

/* ======================================================
 Main Component
====================================================== */

interface Props {
  siteId: string;
}

export default function SpacesPanel({ siteId }: Props) {
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const apiBase = `/api/sites/${siteId}/spaces-summary`;

  const fetchSpaces = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error("Failed to fetch spaces:", err);
    }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const fullyMappedCount = spaces.filter(
    (s) => s.required_count > 0 && s.mapped_required_count === s.required_count
  ).length;

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
                Physical spaces and sensor mapping status
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
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
                    <th className="px-4 py-2 text-left font-medium">Space Name</th>
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
                      <tr
                        key={space.space_id}
                        className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-4 py-2 text-slate-200 font-medium">
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
