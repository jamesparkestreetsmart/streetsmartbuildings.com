"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ──────────────────────────────────────────────── */

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
  multiplier_type: string; // per_equipment | per_space | fixed
  notes: string | null;
  sort_order: number;
}

interface ProductMapping {
  device_type_code: string;
  part_number: string;
  product_name: string;
  vendor: string;
  unit_price: number;
}

interface EquipmentRow {
  id: number; // local key
  equipment_type_id: string;
  fuelType: string | null;
  qty: number;
  includeOptional: boolean;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

let rowCounter = 0;

export default function BOMEstimatorTab() {
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Site config
  const [spaces, setSpaces] = useState(1);

  // Equipment rows
  const [rows, setRows] = useState<EquipmentRow[]>([]);

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
          .select("equipment_type_id, device_type_code, sensor_role, required, quantity, phase_config, multiplier_type, notes, sort_order")
          .order("sort_order"),
        supabase
          .from("library_device_product_mapping")
          .select("device_type_code, part_number, library_products!inner(name, vendor, unit_price)")
          .eq("is_default", true),
      ]);
      setEquipmentTypes(eqTypes || []);
      setRequirements(reqs || []);
      // Flatten the joined data
      const flatMaps: ProductMapping[] = (maps || []).map((m: any) => ({
        device_type_code: m.device_type_code,
        part_number: m.part_number,
        product_name: m.library_products.name,
        vendor: m.library_products.vendor,
        unit_price: Number(m.library_products.unit_price) || 0,
      }));
      setMappings(flatMaps);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Which equipment types have requirements seeded
  const seededTypes = useMemo(
    () => new Set(requirements.map((r) => r.equipment_type_id)),
    [requirements]
  );

  // Group equipment types for dropdown
  const groupedTypes = useMemo(() => {
    const map = new Map<string, EquipmentType[]>();
    for (const eq of equipmentTypes) {
      if (!seededTypes.has(eq.equipment_type_id)) continue;
      if (!map.has(eq.equipment_group)) map.set(eq.equipment_group, []);
      map.get(eq.equipment_group)!.push(eq);
    }
    return map;
  }, [equipmentTypes, seededTypes]);

  // Which phase configs exist per equipment type
  const phaseConfigs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of requirements) {
      if (r.phase_config) {
        if (!map.has(r.equipment_type_id)) map.set(r.equipment_type_id, []);
        const arr = map.get(r.equipment_type_id)!;
        if (!arr.includes(r.phase_config)) arr.push(r.phase_config);
      }
    }
    return map;
  }, [requirements]);

  const mappingByCode = useMemo(() => {
    const map = new Map<string, ProductMapping>();
    for (const m of mappings) map.set(m.device_type_code, m);
    return map;
  }, [mappings]);

  function addRow() {
    // Default to first seeded type
    const firstSeeded = equipmentTypes.find((e) => seededTypes.has(e.equipment_type_id));
    if (!firstSeeded) return;
    const configs = phaseConfigs.get(firstSeeded.equipment_type_id);
    setRows((prev) => [
      ...prev,
      {
        id: ++rowCounter,
        equipment_type_id: firstSeeded.equipment_type_id,
        fuelType: configs?.[0] || null,
        qty: 1,
        includeOptional: false,
      },
    ]);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: number, field: keyof EquipmentRow, value: any) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // Reset fuel type when equipment changes
        if (field === "equipment_type_id") {
          const configs = phaseConfigs.get(value as string);
          updated.fuelType = configs?.[0] || null;
        }
        return updated;
      })
    );
  }

  // Build BOM lines
  const bomLines = useMemo(() => {
    const lines: {
      rowId: number;
      equipmentName: string;
      equipmentQty: number;
      device_type_code: string;
      sensor_role: string;
      required: boolean;
      multiplier_type: string;
      baseQty: number;
      totalQty: number;
      notes: string | null;
      mapping: ProductMapping | null;
      lineTotal: number;
    }[] = [];

    for (const row of rows) {
      const eqName =
        equipmentTypes.find((e) => e.equipment_type_id === row.equipment_type_id)?.name ||
        row.equipment_type_id;
      const reqs = requirements.filter((r) => {
        if (r.equipment_type_id !== row.equipment_type_id) return false;
        if (!row.includeOptional && !r.required) return false;
        if (r.phase_config && row.fuelType && r.phase_config !== row.fuelType) return false;
        return true;
      });
      for (const req of reqs) {
        const mapping = mappingByCode.get(req.device_type_code) || null;
        let totalQty: number;
        switch (req.multiplier_type) {
          case "per_space":
            totalQty = req.quantity * spaces;
            break;
          case "fixed":
            totalQty = req.quantity;
            break;
          default: // per_equipment
            totalQty = req.quantity * row.qty;
            break;
        }
        lines.push({
          rowId: row.id,
          equipmentName: eqName,
          equipmentQty: row.qty,
          device_type_code: req.device_type_code,
          sensor_role: req.sensor_role,
          required: req.required,
          multiplier_type: req.multiplier_type,
          baseQty: req.quantity,
          totalQty,
          notes: req.notes,
          mapping,
          lineTotal: mapping ? mapping.unit_price * totalQty : 0,
        });
      }
    }
    return lines;
  }, [rows, requirements, mappingByCode, equipmentTypes, spaces]);

  const summary = useMemo(
    () => ({
      total: bomLines.reduce((s, l) => s + l.lineTotal, 0),
      requiredOnly: bomLines
        .filter((l) => l.required)
        .reduce((s, l) => s + l.lineTotal, 0),
      totalUnits: bomLines.reduce((s, l) => s + l.totalQty, 0),
      unmapped: bomLines.filter((l) => !l.mapping).length,
    }),
    [bomLines]
  );

  function copyBOM() {
    const header = "Equipment\tRole\tProduct\tPart #\tVendor\tMultiplier\tQty\tUnit\tTotal";
    const dataRows = bomLines.map((l) =>
      [
        l.equipmentName,
        l.sensor_role,
        l.mapping?.product_name || "not mapped",
        l.mapping?.part_number || "",
        l.mapping?.vendor || "",
        l.multiplier_type,
        l.totalQty,
        l.mapping ? fmt(l.mapping.unit_price) : "",
        fmt(l.lineTotal),
      ].join("\t")
    );
    navigator.clipboard.writeText([header, ...dataRows].join("\n"));
    alert("BOM copied — paste into Excel or Sheets");
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading estimator...</div>;

  return (
    <div className="space-y-6">
      {/* Section A — Site Config */}
      <div className="border rounded-lg bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">A. Site Configuration</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Spaces / Zones:</label>
            <input
              type="number"
              min={1}
              value={spaces}
              onChange={(e) => setSpaces(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <p className="text-[10px] text-gray-400">
            Drives thermostat and duct sensor counts (per_space multiplier)
          </p>
        </div>
      </div>

      {/* Section B — Equipment Rows */}
      <div className="border rounded-lg bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">B. Equipment</h2>
          <button
            onClick={addRow}
            className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            + Add Equipment
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">
            Click &quot;+ Add Equipment&quot; to start building your BOM.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, idx) => {
              const configs = phaseConfigs.get(row.equipment_type_id);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 border rounded-lg px-3 py-2 bg-gray-50"
                >
                  <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}.</span>

                  {/* Equipment type dropdown */}
                  <select
                    value={row.equipment_type_id}
                    onChange={(e) => updateRow(row.id, "equipment_type_id", e.target.value)}
                    className="flex-1 min-w-[180px] border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {[...groupedTypes.entries()].map(([group, items]) => (
                      <optgroup key={group} label={group}>
                        {items.map((eq) => (
                          <option key={eq.equipment_type_id} value={eq.equipment_type_id}>
                            {eq.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {/* Fuel type / variant selector */}
                  {configs && configs.length > 0 && (
                    <div className="flex gap-1">
                      {configs.map((cfg) => (
                        <button
                          key={cfg}
                          onClick={() => updateRow(row.id, "fuelType", cfg)}
                          className={`text-[10px] px-2 py-1 rounded border font-medium ${
                            row.fuelType === cfg
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          {cfg}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quantity */}
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500">Qty:</label>
                    <input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) =>
                        updateRow(row.id, "qty", Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-14 border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </div>

                  {/* Optional toggle */}
                  <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.includeOptional}
                      onChange={(e) => updateRow(row.id, "includeOptional", e.target.checked)}
                      className="rounded"
                    />
                    Optional
                  </label>

                  {/* Remove */}
                  <button
                    onClick={() => removeRow(row.id)}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none ml-auto"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section C — Generated BOM */}
      {rows.length === 0 ? (
        <div className="border rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">
          Add equipment above to generate a Bill of Materials.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Required Cost", value: fmt(summary.requiredOnly), highlight: true },
              { label: "All-In Cost", value: fmt(summary.total) },
              { label: "Total Units", value: String(summary.totalUnits) },
              {
                label: "Unmapped",
                value: String(summary.unmapped),
                warn: summary.unmapped > 0,
              },
            ].map((c) => (
              <div
                key={c.label}
                className={`border rounded-lg p-4 bg-white ${c.highlight ? "border-green-200" : ""}`}
              >
                <p className="text-xs text-gray-500">{c.label}</p>
                <p
                  className={`text-lg font-semibold mt-1 ${
                    c.highlight
                      ? "text-green-700"
                      : c.warn
                        ? "text-orange-600"
                        : "text-gray-800"
                  }`}
                >
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          {/* BOM table grouped by equipment row */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">C. Bill of Materials</h2>
              <button
                onClick={copyBOM}
                className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-50 text-gray-600"
              >
                Copy to Clipboard
              </button>
            </div>

            {rows.map((row, idx) => {
              const lines = bomLines.filter((l) => l.rowId === row.id);
              if (lines.length === 0) return null;
              const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
              const eqName =
                equipmentTypes.find((e) => e.equipment_type_id === row.equipment_type_id)?.name ||
                row.equipment_type_id;
              return (
                <div key={row.id} className="border rounded-lg bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{idx + 1}</span>
                      <h3 className="text-sm font-semibold text-gray-700">{eqName}</h3>
                      <span className="text-xs text-gray-400">x{row.qty}</span>
                      {row.fuelType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          {row.fuelType}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{fmt(subtotal)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                          Role
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                          Product
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                          Part #
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                          Vendor
                        </th>
                        <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">
                          Multiplier
                        </th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                          Qty
                        </th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                          Unit
                        </th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((l, i) => (
                        <tr
                          key={i}
                          className={`hover:bg-gray-50 ${!l.required ? "opacity-70" : ""}`}
                        >
                          <td className="px-3 py-2 text-xs text-gray-700">
                            {l.sensor_role}
                            {!l.required && (
                              <span className="ml-1.5 text-[10px] px-1 rounded bg-gray-100 text-gray-500">
                                optional
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-800">
                            {l.mapping ? (
                              l.mapping.product_name
                            ) : (
                              <span className="text-orange-500 italic">not mapped</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">
                            {l.mapping?.part_number || "--"}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {l.mapping?.vendor || "--"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                l.multiplier_type === "per_space"
                                  ? "bg-purple-100 text-purple-700"
                                  : l.multiplier_type === "fixed"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {l.multiplier_type === "per_equipment"
                                ? `×${l.equipmentQty} equip`
                                : l.multiplier_type === "per_space"
                                  ? `×${spaces} space`
                                  : "fixed"}
                            </span>
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
                        <td
                          colSpan={7}
                          className="px-3 py-2 text-xs font-semibold text-gray-600 text-right"
                        >
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
