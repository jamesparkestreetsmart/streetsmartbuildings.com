"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowUpDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EquipmentRow {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  equipment_group: string;
  equipment_type: string;
  space_name: string;
  manufacturer: string | null;
  model: string | null;
  latest_temperature: string | null;
  latest_temperature_ts: string | null;
  latest_humidity: string | null;
  latest_humidity_ts: string | null;
}

export default function EquipmentTable({ siteid }: { siteid: string }) {
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [sortField, setSortField] = useState<string>("equipment_name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // ⏳ Poll every 5 minutes
  useEffect(() => {
    fetchRows();

    const interval = setInterval(fetchRows, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [siteid]);

  async function fetchRows() {
    const { data, error } = await supabase
      .from("view_sites_equipment")
      .select("*")
      .eq("site_id", siteid);

    if (!error && data) {
      setRows(data);
    }
  }

  function sortBy(field: string) {
    if (field === sortField) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    const av = (a as any)[sortField] ?? "";
    const bv = (b as any)[sortField] ?? "";
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  return (
    <TooltipProvider>
      <div className="bg-white p-6 rounded-xl shadow border mt-6">
        <h2 className="text-xl font-semibold mb-4">Equipment</h2>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {[
                ["equipment_name", "Name"],
                ["equipment_group", "Group"],
                ["equipment_type", "Type"],
                ["space_name", "Space"],
                ["latest_temperature", "Temp"],
                ["latest_humidity", "Humidity"],
              ].map(([field, label]) => (
                <th
                  key={field}
                  className="text-left py-2 cursor-pointer select-none"
                  onClick={() => sortBy(field)}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((eq) => (
              <tr key={eq.equipment_id} className="border-b last:border-none">
                <td className="py-2">{eq.equipment_name}</td>
                <td className="py-2">{eq.equipment_group}</td>
                <td className="py-2">{eq.equipment_type}</td>
                <td className="py-2">{eq.space_name}</td>

                {/* Temperature with hover tooltip */}
                <td className="py-2">
                  <Tooltip>
                    <TooltipTrigger>
                      {eq.latest_temperature ?? "—"}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Last updated:{" "}
                        {eq.latest_temperature_ts
                          ? new Date(eq.latest_temperature_ts).toLocaleString()
                          : "Unknown"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </td>

                {/* Humidity with hover tooltip */}
                <td className="py-2">
                  <Tooltip>
                    <TooltipTrigger>
                      {eq.latest_humidity ?? "—"}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Last updated:{" "}
                        {eq.latest_humidity_ts
                          ? new Date(eq.latest_humidity_ts).toLocaleString()
                          : "Unknown"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
