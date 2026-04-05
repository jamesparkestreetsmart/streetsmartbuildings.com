"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

interface EquipmentType {
  equipment_type_id: string;
  name: string;
  equipment_group: string;
}

interface Requirement {
  equipment_type_id: string;
  device_type_code: string;
  sensor_role: string;
  required: boolean;
  quantity: number;
  phase_config: string | null;
  notes: string | null;
}

interface Mapping {
  device_type_code: string;
  part_number: string;
  product_name: string;
  vendor: string | null;
  unit_price: number;
}

interface Selection {
  equipment_type_id: string;
  quantity: number;
  includeOptional: boolean;
  fuelType: string | null;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function BOMEstimatorTab() {
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Selection[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [{ data: eqTypes }, { data: reqs }, { data: maps }] = await Promise.all([
        supabase
          .from("library_equipment_types")
          .select("equipment_type_id, name, equipment_group")
          .order("equipment_group")
          .order("name"),
        supabase
          .from("library_equipment_device_requirements")
          .select("equipment_type_id, device_type_code, sensor_role, required, quantity, phase_config, notes")
          .order("sort_order"),
        supabase
          .from("library_device_product_mapping")
          .select("device_type_code, part_number, product_name, vendor, unit_price")
          .eq("is_default", true),
      ]);
      setEquipmentTypes(eqTypes || []);
      setRequirements(reqs || []);
      setMappings(maps || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Group equipment by group
  const grouped = useMemo(() => {
    const map = new Map<string, EquipmentType[]>();
    for (const eq of equipmentTypes) {
      if (!map.has(eq.equipment_group)) map.set(eq.equipment_group, []);
      map.get(eq.equipment_group)!.push(eq);
    }
    return map;
  }, [equipmentTypes]);

  // Which equipment types have requirements seeded
  const seededTypes = useMemo(
    () => new Set(requirements.map((r) => r.equipment_type_id)),
    [requirements]
  );

  // Which phase configs exist per equipment type
  const phaseConfigs = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of requirements) {
      if (r.phase_config) {
        if (!map.has(r.equipment_type_id)) map.set(r.equipment_type_id, new Set());
        map.get(r.equipment_type_id)!.add(r.phase_config);
      }
    }
    return map;
  }, [requirements]);

  const mappingByCode = useMemo(() => {
    const map = new Map<string, Mapping>();
    for (const m of mappings) map.set(m.device_type_code, m);
    return map;
  }, [mappings]);

  function getSelection(typeId: string) {
    return selections.find((s) => s.equipment_type_id === typeId);
  }

  function toggleEquipment(typeId: string) {
    setSelections((prev) => {
      const exists = prev.find((s) => s.equipment_type_id === typeId);
      if (exists) return prev.filter((s) => s.equipment_type_id !== typeId);
      const configs = phaseConfigs.get(typeId);
      const defaultFuel = configs ? [...configs][0] : null;
      return [...prev, { equipment_type_id: typeId, quantity: 1, includeOptional: false, fuelType: defaultFuel }];
    });
  }

  function updateSel(typeId: string, field: keyof Selection, value: any) {
    setSelections((prev) =>
      prev.map((s) => (s.equipment_type_id === typeId ? { ...s, [field]: value } : s))
    );
  }

  // Build BOM lines
  const bomLines = useMemo(() => {
    const lines: {
      equipment_type_id: string;
      equipmentName: string;
      equipmentQty: number;
      device_type_code: string;
      sensor_role: string;
      required: boolean;
      totalQty: number;
      notes: string | null;
      mapping: Mapping | null;
      lineTotal: number;
    }[] = [];

    for (const sel of selections) {
      const eqName = equipmentTypes.find((e) => e.equipment_type_id === sel.equipment_type_id)?.name || sel.equipment_type_id;
      const reqs = requirements.filter((r) => {
        if (r.equipment_type_id !== sel.equipment_type_id) return false;
        if (!sel.includeOptional && !r.required) return false;
        // filter by fuel type if applicable
        if (r.phase_config && sel.fuelType && r.phase_config !== sel.fuelType) return false;
        return true;
      });
      for (const req of reqs) {
        const mapping = mappingByCode.get(req.device_type_code) || null;
        const totalQty = req.quantity * sel.quantity;
        lines.push({
          equipment_type_id: sel.equipment_type_id,
          equipmentName: eqName,
          equipmentQty: sel.quantity,
          device_type_code: req.device_type_code,
          sensor_role: req.sensor_role,
          required: req.required,
          totalQty,
          notes: req.notes,
          mapping,
          lineTotal: mapping ? mapping.unit_price * totalQty : 0,
        });
      }
    }
    return lines;
  }, [selections, requirements, mappingByCode, equipmentTypes]);

  const summary = useMemo(() => ({
    total: bomLines.reduce((s, l) => s + l.lineTotal, 0),
    requiredOnly: bomLines.filter((l) => l.required).reduce((s, l) => s + l.lineTotal, 0),
    totalUnits: bomLines.reduce((s, l) => s + l.totalQty, 0),
    unmapped: bomLines.filter((l) => !l.mapping).length,
  }), [bomLines]);

  function copyBOM() {
    const rows = bomLines.map((l) =>
      [l.equipmentName, l.sensor_role, l.mapping?.product_name || "not mapped",
       l.mapping?.part_number || "", l.mapping?.vendor || "",
       l.totalQty, l.mapping ? fmt(l.mapping.unit_price) : "", fmt(l.lineTotal)
      ].join("\t")
    );
    navigator.clipboard.writeText(
      ["Equipment\tRole\tProduct\tPart #\tVendor\tQty\tUnit\tTotal", ...rows].join("\n")
    );
    alert("BOM copied -- paste into Excel or Sheets");
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading estimator...</div>;

  return (
    <div className="space-y-6">
      {/* Equipment picker grouped */}
      <div className="border rounded-lg bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">1. Select Equipment</h2>
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map((eq) => {
                const sel = getSelection(eq.equipment_type_id);
                const isSelected = !!sel;
                const hasReqs = seededTypes.has(eq.equipment_type_id);
                const configs = phaseConfigs.get(eq.equipment_type_id);
                const reqCount = requirements.filter((r) => r.equipment_type_id === eq.equipment_type_id && r.required).length;

                return (
                  <div
                    key={eq.equipment_type_id}
                    onClick={() => hasReqs && toggleEquipment(eq.equipment_type_id)}
                    className={`border rounded-lg p-3 transition-colors ${
                      !hasReqs ? "opacity-40 cursor-not-allowed bg-gray-50" :
                      isSelected ? "border-green-500 bg-green-50 cursor-pointer" :
                      "border-gray-200 hover:border-gray-300 cursor-pointer"
                    }`}
                  >
                    <p className={`text-xs font-medium ${isSelected ? "text-green-700" : "text-gray-700"}`}>
                      {eq.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {hasReqs ? `${reqCount} required device${reqCount !== 1 ? "s" : ""}` : "requirements not yet defined"}
                    </p>

                    {isSelected && sel && (
                      <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* Fuel type selector */}
                        {configs && configs.size > 0 && (
                          <div className="flex gap-1">
                            {[...configs].map((cfg) => (
                              <button
                                key={cfg}
                                onClick={() => updateSel(eq.equipment_type_id, "fuelType", cfg)}
                                className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                                  sel.fuelType === cfg
                                    ? "bg-green-600 text-white border-green-600"
                                    : "bg-white text-gray-600 border-gray-300"
                                }`}
                              >
                                {cfg}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-gray-500">Qty:</label>
                          <input
                            type="number"
                            min={1}
                            value={sel.quantity}
                            onChange={(e) => updateSel(eq.equipment_type_id, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-12 border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sel.includeOptional}
                            onChange={(e) => updateSel(eq.equipment_type_id, "includeOptional", e.target.checked)}
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
        ))}
      </div>

      {selections.length === 0 ? (
        <div className="border rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">
          Select one or more equipment types above to generate a BOM.
        </div>
      ) : (
        <>
          {/* Summary */}
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

          {/* BOM table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">2. Bill of Materials</h2>
              <button onClick={copyBOM} className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-50 text-gray-600">
                Copy to Clipboard
              </button>
            </div>

            {selections.map((sel) => {
              const lines = bomLines.filter((l) => l.equipment_type_id === sel.equipment_type_id);
              if (lines.length === 0) return null;
              const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
              const eqName = equipmentTypes.find((e) => e.equipment_type_id === sel.equipment_type_id)?.name || sel.equipment_type_id;
              return (
                <div key={sel.equipment_type_id} className="border rounded-lg bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-700">{eqName}</h3>
                      <span className="text-xs text-gray-400">x{sel.quantity}</span>
                      {sel.fuelType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          {sel.fuelType}
                        </span>
                      )}
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
                          <td className="px-3 py-2 text-xs text-gray-700">
                            {l.sensor_role}
                            {!l.required && <span className="ml-1.5 text-[10px] px-1 rounded bg-gray-100 text-gray-500">optional</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-800">
                            {l.mapping ? l.mapping.product_name : <span className="text-orange-500 italic">not mapped</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{l.mapping?.part_number || "--"}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{l.mapping?.vendor || "--"}</td>
                          <td className="px-3 py-2 text-right text-xs">{l.totalQty}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{l.mapping ? fmt(l.mapping.unit_price) : "--"}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-xs">{fmt(l.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-gray-50">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Subtotal</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-sm text-gray-800">{fmt(subtotal)}</td>
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
