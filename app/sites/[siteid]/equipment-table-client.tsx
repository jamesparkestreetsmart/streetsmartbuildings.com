"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";

interface EquipmentRecord {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  description: string | null;
  equipment_group: string;
  equipment_type: string;
  space_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
}

export default function EquipmentTableClient({
  initialData,
  siteid,
}: {
  initialData: EquipmentRecord[];
  siteid: string;
}) {
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof EquipmentRecord>("equipment_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedFiltered = useMemo(() => {
    let rows = [...initialData];

    // Search
    if (search.trim() !== "") {
      rows = rows.filter((r) =>
        r.equipment_name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Sorting
    rows.sort((a, b) => {
      const x = String(a[sortColumn] ?? "").toLowerCase();
      const y = String(b[sortColumn] ?? "").toLowerCase();

      if (x < y) return sortDir === "asc" ? -1 : 1;
      if (x > y) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [search, sortColumn, sortDir, initialData]);

  const toggleSort = (col: keyof EquipmentRecord) => {
    if (sortColumn === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  return (
    <div className="mt-4">
      {/* Search Bar */}
      <input
        className="w-full px-3 py-2 border rounded mb-4"
        placeholder="Search equipment..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th
                className="py-2 px-3 cursor-pointer"
                onClick={() => toggleSort("equipment_name")}
              >
                Name <ArrowUpDown className="inline h-3 ml-1" />
              </th>
              <th className="py-2 px-3">Type</th>
              <th className="py-2 px-3">Group</th>
              <th className="py-2 px-3">Space</th>
              <th
                className="py-2 px-3 cursor-pointer"
                onClick={() => toggleSort("status")}
              >
                Status <ArrowUpDown className="inline h-3 ml-1" />
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedFiltered.map((eq) => (
              <tr key={eq.equipment_id} className="border-t hover:bg-gray-50">
                <td className="py-2 px-3">{eq.equipment_name}</td>
                <td className="py-2 px-3">{eq.equipment_type}</td>
                <td className="py-2 px-3">{eq.equipment_group}</td>
                <td className="py-2 px-3">{eq.space_name}</td>
                <td className="py-2 px-3">{eq.status}</td>
              </tr>
            ))}

            {sortedFiltered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4 text-gray-500">
                  No equipment found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
