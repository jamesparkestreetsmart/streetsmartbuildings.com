"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EquipmentRow = {
  equipment_id: string;
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
  latest_binary_state: string | null;
  latest_binary_state_ts: string | null;
};

export default function EquipmentTable({ siteid }: { siteid: string }) {
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("view_sites_equipment")
        .select("*")
        .eq("site_id", siteid)
        .order("equipment_group", { ascending: true })
        .order("space_name", { ascending: true })
        .order("equipment_name", { ascending: true });

      if (error) {
        console.error("Equipment load error:", error);
      } else {
        setRows(data ?? []);
      }

      setLoading(false);
    }

    load();
  }, [siteid]);

  if (loading) {
    return <div className="mt-4 text-gray-500">Loading equipment…</div>;
  }

  if (!rows.length) {
    return (
      <div className="mt-4 text-gray-500">
        No equipment records found for this site.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow border mt-4">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-2">Group</th>
            <th className="px-4 py-2">Space</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Latest Temp</th>
            <th className="px-4 py-2">Latest Humidity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.equipment_id} className="border-t">
              <td className="px-4 py-2">{row.equipment_group}</td>
              <td className="px-4 py-2">{row.space_name}</td>
              <td className="px-4 py-2">{row.equipment_name}</td>
              <td className="px-4 py-2">{row.equipment_type}</td>
              <td className="px-4 py-2">
                {row.latest_temperature ?? "—"}
              </td>
              <td className="px-4 py-2">{row.latest_humidity ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
