"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface EquipmentRow {
  equipment_id: string;
  equipment_name: string;
  equipment_group: string | null;
  equipment_type_id: string | null;
  space_name: string | null;
  latest_temperature: number | null;
  latest_temperature_ts: string | null;
  latest_humidity: number | null;
  latest_humidity_ts: string | null;
  latest_binary_state: string | null;
  status: string;
}

interface Props {
  siteId: string;
}

interface MergedRow {
  hvac: EquipmentRow | null;
  space: EquipmentRow | null;
  space_name: string | null;
}

export default function SpaceHvacTable({ siteId }: Props) {
  const [mergedRows, setMergedRows] = useState<MergedRow[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: rows, error } = await supabase
        .from("view_sites_equipment")
        .select("*")
        .eq("site_id", siteId)
        .in("equipment_group", ["Space", "HVAC"])
        .order("equipment_name", { ascending: true });

      if (error) {
        console.error("Supabase fetch error:", error);
        return;
      }

      const allRows = rows as EquipmentRow[];
      const spaces = allRows.filter((r) => r.equipment_group === "Space");
      const hvacList = allRows.filter((r) => r.equipment_group === "HVAC");

      // Build a map of space_name -> Space equipment
      const spaceByName: Record<string, EquipmentRow> = {};
      for (const space of spaces) {
        if (space.space_name) {
          spaceByName[space.space_name] = space;
        }
      }

      // Track which spaces are used by HVAC
      const usedSpaceNames = new Set<string>();

      // Create merged rows for all HVAC equipment
      const merged: MergedRow[] = hvacList.map((hvac) => {
        const spaceName = hvac.space_name;
        const matchedSpace = spaceName ? spaceByName[spaceName] : null;
        if (spaceName && matchedSpace) {
          usedSpaceNames.add(spaceName);
        }
        return {
          hvac,
          space: matchedSpace || null,
          space_name: spaceName,
        };
      });

      // Add rows for Spaces that aren't connected to any HVAC
      for (const space of spaces) {
        if (space.space_name && !usedSpaceNames.has(space.space_name)) {
          merged.push({
            hvac: null,
            space: space,
            space_name: space.space_name,
          });
        }
      }

      // Sort by space_name
      merged.sort((a, b) => {
        const aName = a.space_name || "";
        const bName = b.space_name || "";
        return aName.localeCompare(bName);
      });

      setMergedRows(merged);
    };

    fetchData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [siteId]);

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      <h2 className="text-xl font-semibold mb-4">Space & HVAC</h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-3 px-4 font-semibold">HVAC Equipment</th>
            <th className="py-3 px-4 font-semibold">Type</th>
            <th className="py-3 px-4 font-semibold">Space</th>
            <th className="py-3 px-4 font-semibold">Space Temp (°F)</th>
            <th className="py-3 px-4 font-semibold">Space Humidity (%)</th>
            <th className="py-3 px-4 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {mergedRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 px-4 text-gray-500 text-center">
                No Space or HVAC equipment found
              </td>
            </tr>
          ) : (
            mergedRows.map((row, idx) => {
              const { hvac, space, space_name } = row;
              const rowKey = hvac?.equipment_id || space?.equipment_id || idx;

              return (
                <tr key={rowKey} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {hvac ? (
                      <Link
                        href={`/sites/${siteId}/equipment/${hvac.equipment_id}/individual-equipment`}
                        className="underline text-blue-700"
                      >
                        {hvac.equipment_name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">{hvac?.equipment_type_id ?? "—"}</td>
                  <td className="py-3 px-4">
                    {space ? (
                      <Link
                        href={`/sites/${siteId}/equipment/${space.equipment_id}/individual-equipment`}
                        className="underline text-blue-700"
                      >
                        {space_name}
                      </Link>
                    ) : (
                      space_name ?? "—"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {space ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {space.latest_temperature ?? "—"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                            <p className="font-semibold text-sm">Last Updated:</p>
                            <p className="text-xs opacity-90">
                              {space.latest_temperature_ts
                                ? new Date(space.latest_temperature_ts).toLocaleString()
                                : "No data"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {space ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {space.latest_humidity ?? "—"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                            <p className="font-semibold text-sm">Last Updated:</p>
                            <p className="text-xs opacity-90">
                              {space.latest_humidity_ts
                                ? new Date(space.latest_humidity_ts).toLocaleString()
                                : "No data"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 px-4">{hvac?.status ?? space?.status ?? "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
