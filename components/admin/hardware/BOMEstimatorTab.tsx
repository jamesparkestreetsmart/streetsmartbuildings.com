"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Requirement {
  equipment_type_id: string;
  device_type_code: string;
  sensor_role: string;
  required: boolean;
  quantity: number;
  notes: string | null;
}

interface Mapping {
  device_type_code: string;
  part_number: string;
  product_name: string;
  vendor: string | null;
  unit_price: number;
  is_default: boolean;
  tier: string | null;
}

interface EquipmentSelection {
  equipment_type_id: string;
  quantity: number;
  includeOptional: boolean;
}

const EQUIPMENT_LABELS: Record<string, string> = {
  freezer: "Freezer",
  refrigerator: "Refrigerator",
  hvac_rooftop_unit: "HVAC Rooftop Unit",
  iot_gateway: "IoT Gateway",
};

const EQUIPMENT_ICONS: Record<string, string> = {
  freezer: "Freezer",
  refrigerator: "Fridge",
  hvac_rooftop_unit: "HVAC RTU",
  iot_gateway: "Gateway",
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function BOMEstimatorTab() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<EquipmentSelection[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [{ data: reqs }, { data: maps }] = await Promise.all([
        supabase
          .from("library_equipment_device_requirements")
          .select("equipment_type_id, device_type_code, sensor_role, required, quantity, notes")
          .order("equipment_type_id"),
        supabase
          .from("library_device_product_mapping")
          .select("device_type_code, part_number, product_name, vendor, unit_price, is_default, tier")
          .eq("is_default", true),
      ]);
      setRequirements(reqs || []);
      setMappings(maps || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const equipmentTypes = useMemo(
    () => [...new Set(requirements.map((r) => r.equipment_type_id))].sort(),
    [requirements]
  );

  function toggleEquipment(type: string) {
    setSelections((prev) => {
      const exists = prev.find((s) => s.equipment_type_id === type);
      if (exists) return prev.filter((s) => s.equipment_type_id !== type);
      return [...prev, { equipment_type_id: type, quantity: 1, includeOptional: false }];
    });
  }

  function updateSelection(type: string, field: keyof EquipmentSelection, value: any) {
    setSelections((prev) =>
      prev.map((s) => (s.equipment_type_id === type ? { ...s, [field]: value } : s))
    );
  }

  const mappingByCode = useMemo(() => {
    const map = new Map<string, Mapping>();
    for (const m of mappings) map.set(m.device_type_code, m);
    return map;
  }, [mappings]);

  // Build BOM lines
  const bomLines = useMemo(() => {
    const lines: {
      equipment_type_id: string;
      equipmentQty: number;
      device_type_code: string;
      sensor_role: string;
      required: boolean;
      reqQty: number;
      totalQty: number;
      notes: string | null;
      mapping: Mapping | null;
      lineTotal: number;
    }[] = [];

    for (const sel of selections) {
      const reqs = requirements.filter(
        (r) =>
          r.equipment_type_id === sel.equipment_type_id &&
          (sel.includeOptional || r.required)
      );
      for (const req of reqs) {
        const mapping = mappingByCode.get(req.device_type_code) || null;
        const totalQty = req.quantity * sel.quantity;
        const lineTotal = mapping ? mapping.unit_price * totalQty : 0;
        lines.push({
          equipment_type_id: sel.equipment_type_id,
          equipmentQty: sel.quantity,
          device_type_code: req.device_type_code,
          sensor_role: req.sensor_role,
          required: req.required,
          reqQty: req.quantity,
          totalQty,
          notes: req.notes,
          mapping,
          lineTotal,
        });
      }
    }
    return lines;
  }, [selections, requirements, mappingByCode]);

  const summary = useMemo(() => {
    const total = bomLines.reduce((s, l) => s + l.lineTotal, 0);
    const requiredOnly = bomLines.filter((l) => l.required).reduce((s, l) => s + l.lineTotal, 0);
    const totalUnits = bomLines.reduce((s, l) => s + l.totalQty, 0);
    const unmapped = bomLines.filter((l) => !l.mapping).length;
    return { total, requiredOnly, totalUnits, unmapped };
  }, [bomLines]);

  function copyBOM() {
    const header = "Equipment\tRole\tDevice\tPart #\tVendor\tQty\tUnit Price\tLine Total";
    const rows = bomLines.map((l) =>
      [
        EQUIPMENT_LABELS[l.equipment_type_id] || l.equipment_type_id,
        l.sensor_role,
        l.mapping?.product_name || "-- not mapped --",
        l.mapping?.part_number || "",
        l.mapping?.vendor || "",
        l.totalQty,
        l.mapping ? fmt(l.mapping.unit_price) : "",
        fmt(l.lineTotal),
      ].join("\t")
    );
    navigator.clipboard.writeText([header, ...rows].join("\n"));
    alert("BOM copied to clipboard -- paste into Excel or Sheets");
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Loading estimator...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Equipment picker */}
      <div className="border rounded-lg bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">1. Select Equipment</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {equipmentTypes.map((type) => {
            const sel = selections.find((s) => s.equipment_type_id === type);
            const isSelected = !!sel;
            return (
              <div
                key={type}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  isSelected ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => toggleEquipment(type)}
              >
                <p className={`text-sm font-medium ${isSelected ? "text-green-700" : "text-gray-700"}`}>
                  {EQUIPMENT_LABELS[type] || type}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {requirements.filter((r) => r.equipment_type_id === type && r.required).length} required devices
                </p>
                {isSelected && (
                  <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Qty:</label>
                      <input
                        type="number"
                        min={1}
                        value={sel.quantity}
                        onChange={(e) => updateSelection(type, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sel.includeOptional}
                        onChange={(e) => updateSelection(type, "includeOptional", e.target.checked)}
                        className="rounded"
                      />
                      Include optional
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selections.length === 0 ? (
        <div className="border rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">
          Select one or more equipment types above to generate a BOM.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Required Cost", value: fmt(summary.requiredOnly), highlight: true },
              { label: "All-In Cost", value: fmt(summary.total) },
              { label: "Total Units", value: String(summary.totalUnits) },
              { label: "Unmapped", value: String(summary.unmapped), warn: summary.unmapped > 0 },
            ].map((c) => (
              <div key={c.label} className={`border rounded-lg p-4 bg-white ${c.highlight ? "border-green-200" : ""}`}>
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className={`text-lg font-semibold mt-1 ${c.highlight ? "text-green-700" : c.warn ? "text-orange-600" : "text-gray-800"}`}>
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          {/* BOM table grouped by equipment */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">2. Bill of Materials</h2>
              <button
                onClick={copyBOM}
                className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-50 text-gray-600 transition-colors"
              >
                Copy to Clipboard
              </button>
            </div>

            {selections.map((sel) => {
              const lines = bomLines.filter((l) => l.equipment_type_id === sel.equipment_type_id);
              const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
              if (lines.length === 0) return null;
              return (
                <div key={sel.equipment_type_id} className="border rounded-lg bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-700">
                        {EQUIPMENT_LABELS[sel.equipment_type_id] || sel.equipment_type_id}
                      </h3>
                      <span className="text-xs text-gray-400">x{sel.quantity}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{fmt(subtotal)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Role</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Product</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Part #</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Qty</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Unit</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((l, i) => (
                        <tr key={i} className={`hover:bg-gray-50 ${!l.required ? "opacity-70" : ""}`}>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-700">{l.sensor_role}</span>
                            {!l.required && (
                              <span className="ml-1.5 text-[10px] px-1 rounded bg-gray-100 text-gray-500">optional</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-800">
                            {l.mapping ? l.mapping.product_name : (
                              <span className="text-orange-500 italic">-- not mapped --</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">
                            {l.mapping?.part_number || "--"}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {l.mapping?.vendor || "--"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">{l.totalQty}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {l.mapping ? fmt(l.mapping.unit_price) : "--"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-xs">
                            {fmt(l.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-gray-50">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">
                          Subtotal
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-sm text-gray-800">
                          {fmt(subtotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
