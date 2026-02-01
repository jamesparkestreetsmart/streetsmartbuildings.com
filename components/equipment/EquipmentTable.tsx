"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
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

export default function EquipmentCheckupTable({ siteId }: Props) {
  const [data, setData] = useState<EquipmentRow[]>([]);
  const [sortColumn, setSortColumn] = useState<string>("equipment_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const fetchData = async () => {
      const { data: rows, error } = await supabase
        .from("view_sites_equipment")
        .select("*")
        .eq("site_id", siteId)
        .not("equipment_group", "in", '("Inventory","Infrastructure","Space","HVAC","Plumbing")')
        .order("equipment_group", { ascending: true })
        .order("equipment_name", { ascending: true });

      if (error) {
        console.error("Supabase fetch error:", error);
        return;
      }

      setData(rows as EquipmentRow[]);
    };

    fetchData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [siteId]);

  const sortData = (column: string) => {
    let direction: "asc" | "desc" = "asc";

    if (sortColumn === column) {
      direction = sortDirection === "asc" ? "desc" : "asc";
    }

    setSortColumn(column);
    setSortDirection(direction);

    const sorted = [...data].sort((a, b) => {
      const valA = (a as any)[column] ?? "";
      const valB = (b as any)[column] ?? "";

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });

    setData(sorted);
  };

  const exportCSV = () => {
    if (data.length === 0) return;

    const headers = [
      "equipment_name",
      "equipment_group",
      "equipment_type_id",
      "space_name",
      "latest_temperature",
      "latest_humidity",
      "status",
      "latest_binary_state",
    ];

    const rows = data.map((row) =>
      headers.map((h) => JSON.stringify((row as any)[h] ?? "")).join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `equipment_checkup_${siteId}.csv`;
    link.click();
  };

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Equipment Checkup</h2>

        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            {[
              ["equipment_name", "Equipment Name"],
              ["equipment_group", "Group"],
              ["equipment_type_id", "Type"],
              ["space_name", "Space"],
              ["latest_temperature", "Temp (°F)"],
              ["latest_humidity", "Humidity (%)"],
              ["status", "Status"],
            ].map(([key, label]) => (
              <th
                key={key}
                onClick={() => sortData(key)}
                className="py-3 px-4 font-semibold cursor-pointer select-none"
              >
                {label}{" "}
                {sortColumn === key
                  ? sortDirection === "asc"
                    ? "↑"
                    : "↓"
                  : ""}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row) => (
            <tr key={row.equipment_id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4 underline text-blue-700">
                <Link href={`/sites/${siteId}/equipment/${row.equipment_id}/individual-equipment`}>
                  {row.equipment_name}
                </Link>
              </td>

              <td className="py-3 px-4">{row.equipment_group ?? "—"}</td>
              <td className="py-3 px-4">{row.equipment_type_id ?? "—"}</td>
              <td className="py-3 px-4">{row.space_name ?? "—"}</td>

              {/* Temperature */}
              <td className="py-3 px-4">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        {row.latest_temperature ?? "—"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="font-semibold text-sm">Last Updated:</p>
                      <p className="text-xs opacity-90">
                        {row.latest_temperature_ts
                          ? new Date(row.latest_temperature_ts).toLocaleString()
                          : "No data"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>

              {/* Humidity */}
              <td className="py-3 px-4">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        {row.latest_humidity ?? "—"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="font-semibold text-sm">Last Updated:</p>
                      <p className="text-xs opacity-90">
                        {row.latest_humidity_ts
                          ? new Date(row.latest_humidity_ts).toLocaleString()
                          : "No data"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>

              <td className="py-3 px-4">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}