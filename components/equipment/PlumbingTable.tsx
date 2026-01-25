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

export default function PlumbingTable({ siteId }: Props) {
  const [plumbing, setPlumbing] = useState<EquipmentRow[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: rows, error } = await supabase
        .from("view_sites_equipment")
        .select("*")
        .eq("site_id", siteId)
        .eq("equipment_group", "Plumbing")
        .order("equipment_name", { ascending: true });

      if (error) {
        console.error("Supabase fetch error:", error);
        return;
      }

      setPlumbing(rows as EquipmentRow[]);
    };

    fetchData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [siteId]);

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      <h2 className="text-xl font-semibold mb-4">Plumbing Equipment</h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-3 px-4 font-semibold">Equipment Name</th>
            <th className="py-3 px-4 font-semibold">Group</th>
            <th className="py-3 px-4 font-semibold">Type</th>
            <th className="py-3 px-4 font-semibold">Space</th>
            <th className="py-3 px-4 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {plumbing.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 px-4 text-gray-500 text-center">
                No plumbing equipment found
              </td>
            </tr>
          ) : (
            plumbing.map((row) => (
              <tr key={row.equipment_id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 underline text-blue-700">
                  <Link href={`/sites/${siteId}/equipment/${row.equipment_id}/individual-equipment`}>
                    {row.equipment_name}
                  </Link>
                </td>
                <td className="py-3 px-4">{row.equipment_group ?? "—"}</td>
                <td className="py-3 px-4">{row.equipment_type_id ?? "—"}</td>
                <td className="py-3 px-4">{row.space_name ?? "—"}</td>
                <td className="py-3 px-4">{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
