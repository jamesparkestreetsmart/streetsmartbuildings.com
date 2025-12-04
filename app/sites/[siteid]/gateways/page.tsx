// app/sites/[siteid]/gateways/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface GatewayEntityRow {
  id: string;
  site_id: string;
  ha_device_id: string;
  gr_device_name: string | null;
  domain: string | null;
  device_class: string | null;
  last_state: string | null;
  last_value: string | null;
  last_unit: string | null;
  last_updated_at: string | null;
  equipment_id: string | null;
  mapped_sensor_type: string | null;
}

interface EquipmentRow {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  equipment_type: string | null;
}

/**
 * Simple fuzzy suggestion:
 * - lowercases both strings
 * - scores “contains” + shared tokens
 */
function suggestEquipment(
  entity: GatewayEntityRow,
  equipments: EquipmentRow[]
): EquipmentRow | null {
  if (!entity.gr_device_name) return null;

  const name = entity.gr_device_name.toLowerCase();

  let best: { score: number; eq: EquipmentRow | null } = { score: 0, eq: null };

  for (const eq of equipments) {
    const eqName = eq.equipment_name.toLowerCase();

    let score = 0;

    // strong bonus if one name is contained in the other
    if (name.includes(eqName) || eqName.includes(name)) {
      score += 5;
    }

    // token overlap bonus
    const nameTokens = name.split(/[\s_-]+/);
    const eqTokens = eqName.split(/[\s_-]+/);
    const overlap = nameTokens.filter((t) => eqTokens.includes(t)).length;
    score += overlap;

    // light bonus for matching equipment_type vs sensor_type
    if (entity.mapped_sensor_type && eq.equipment_type) {
      const t = entity.mapped_sensor_type.toLowerCase();
      const et = eq.equipment_type.toLowerCase();
      if (et.includes(t) || t.includes(et)) {
        score += 2;
      }
    }

    if (score > best.score) {
      best = { score, eq };
    }
  }

  // require at least some confidence
  if (!best.eq || best.score < 2) return null;
  return best.eq;
}

export default function GatewayPage({
  params,
}: {
  params: Promise<{ siteid: string }>;
}) {
  const router = useRouter();

  const [siteid, setSiteId] = useState<string>("");
  const [registry, setRegistry] = useState<GatewayEntityRow[]>([]);
  const [equipments, setEquipments] = useState<EquipmentRow[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [savingMapFor, setSavingMapFor] = useState<string | null>(null);

  /** Resolve params **/
  useEffect(() => {
    (async () => {
      const resolved = await params;
      setSiteId(resolved.siteid);
    })();
  }, [params]);

  /** Fetch registry entries **/
  const fetchRegistry = async (sid: string) => {
    setLoadingRegistry(true);

    const { data, error } = await supabase
      .from("a_devices_gateway_registry")
      .select(
        `
        id,
        site_id,
        ha_device_id,
        gr_device_name,
        domain,
        device_class,
        last_state,
        last_value,
        last_unit,
        last_updated_at,
        equipment_id,
        mapped_sensor_type
      `
      )
      .eq("site_id", sid);

    if (error) {
      console.error("Error loading entity registry:", error);
      setRegistry([]);
    } else {
      setRegistry((data ?? []) as GatewayEntityRow[]);
    }

    setLoadingRegistry(false);
  };

  /** Fetch equipments for this site **/
  const fetchEquipments = async (sid: string) => {
    const { data, error } = await supabase
      .from("a_equipments")
      .select("equipment_id, site_id, equipment_name, equipment_type")
      .eq("site_id", sid)
      .order("equipment_name", { ascending: true });

    if (error) {
      console.error("Error loading equipments:", error);
      setEquipments([]);
    } else {
      setEquipments((data ?? []) as EquipmentRow[]);
    }
  };

  useEffect(() => {
    if (!siteid) return;
    fetchRegistry(siteid);
    fetchEquipments(siteid);
  }, [siteid]);

  /** Copy webhook URL **/
  const handleCopyWebhook = async () => {
    const url = `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`;
    await navigator.clipboard.writeText(url);
    setSyncStatus("success");
    setTimeout(() => setSyncStatus("idle"), 1500);
  };

  /** "Run Sync" = just refresh from Supabase (HA does the actual push) **/
  const handleRunSync = async () => {
    setSyncStatus("loading");
    try {
      await fetchRegistry(siteid);
      setSyncStatus("success");
    } catch (err) {
      console.error("Manual sync/refresh error:", err);
      setSyncStatus("error");
    }
    setTimeout(() => setSyncStatus("idle"), 2000);
  };

  /** Save mapping for a single row **/
  const handleEquipmentMapChange = async (
    haDeviceId: string,
    equipmentId: string | ""
  ) => {
    if (!siteid) return;
    setSavingMapFor(haDeviceId);

    try {
      const { error } = await supabase
        .from("a_devices_gateway_registry")
        .update({
          equipment_id: equipmentId === "" ? null : equipmentId,
        })
        .eq("site_id", siteid)
        .eq("ha_device_id", haDeviceId);

      if (error) throw error;

      // update local state
      setRegistry((prev) =>
        prev.map((row) =>
          row.ha_device_id === haDeviceId
            ? { ...row, equipment_id: equipmentId || null }
            : row
        )
      );
    } catch (err) {
      console.error("Error saving equipment mapping:", err);
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 2000);
    } finally {
      setSavingMapFor(null);
    }
  };

  if (!siteid) {
    return (
      <div className="min-h-screen p-10 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  const webhookUrl = `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`;

  /** Sort registry: sensor_type / device_class / name */
  const sortedRegistry = useMemo(() => {
    return [...registry].sort((a, b) => {
      const tA = (a.mapped_sensor_type || a.device_class || "").toLowerCase();
      const tB = (b.mapped_sensor_type || b.device_class || "").toLowerCase();
      if (tA < tB) return -1;
      if (tA > tB) return 1;

      const nA = (a.gr_device_name || "").toLowerCase();
      const nB = (b.gr_device_name || "").toLowerCase();
      if (nA < nB) return -1;
      if (nA > nB) return 1;
      return 0;
    });
  }, [registry]);

  /** Last sync = most recent last_updated_at */
  const lastSyncDisplay = useMemo(() => {
    const timestamps = registry
      .map((r) => r.last_updated_at)
      .filter((v): v is string => !!v);

    if (timestamps.length === 0) return "—";

    const latest = timestamps.reduce((max, ts) =>
      new Date(ts) > new Date(max) ? ts : max
    );
    const d = new Date(latest);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }, [registry]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* PAGE TITLE */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>

        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      {/* WEBHOOK + SYNC SECTION */}
      <Card className="mb-8 border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Webhook URL */}
          <div>
            <p className="text-sm text-gray-600 mb-1">
              This is the endpoint Home Assistant should POST entities to.
            </p>

            <div className="flex flex-col md:flex-row gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={handleCopyWebhook}>
                Copy
              </Button>
            </div>

            {/* SYNC RESULT OUTPUT */}
            {syncStatus !== "idle" && (
              <div
                className={`mt-4 p-3 rounded text-sm ${
                  syncStatus === "success"
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : syncStatus === "error"
                    ? "bg-red-100 text-red-700 border border-red-300"
                    : "bg-blue-100 text-blue-700 border border-blue-300"
                }`}
              >
                {syncStatus === "loading" && (
                  <p>Refreshing registry from Supabase…</p>
                )}
                {syncStatus === "success" && (
                  <p>Refresh complete — registry reloaded successfully.</p>
                )}
                {syncStatus === "error" && (
                  <p>Operation failed — see console for details.</p>
                )}
              </div>
            )}
          </div>

          {/* Manual Sync / Refresh */}
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Click to refresh the entity registry with the latest data pushed
              from Home Assistant.
            </p>

            <Button
              onClick={handleRunSync}
              disabled={syncStatus === "loading"}
              className={
                syncStatus === "success"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : syncStatus === "error"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : ""
              }
            >
              {syncStatus === "loading"
                ? "Refreshing…"
                : syncStatus === "success"
                ? "Refresh Complete ✓"
                : syncStatus === "error"
                ? "Refresh Failed"
                : "Run Sync Now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last sync */}
      <p className="text-xs text-gray-500 mb-2">
        Last sync: {lastSyncDisplay}
      </p>

      {/* ENTITY REGISTRY TABLE */}
      <Card className="border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Z-Wave & HA Entities</CardTitle>
        </CardHeader>

        <CardContent>
          {loadingRegistry ? (
            <p className="text-sm text-gray-500">Loading entities…</p>
          ) : sortedRegistry.length === 0 ? (
            <p className="text-sm text-gray-500">
              No entities received from Home Assistant yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Entity ID</th>
                    <th className="px-3 py-2 text-left">Domain</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Equipment Mapping</th>
                    <th className="px-3 py-2 text-left">State</th>
                    <th className="px-3 py-2 text-left">Value</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedRegistry.map((row) => {
                    const suggested = suggestEquipment(row, equipments);
                    const selectedEquipment =
                      equipments.find(
                        (e) => e.equipment_id === row.equipment_id
                      ) || null;

                    return (
                      <tr
                        key={row.ha_device_id}
                        className="border-t hover:bg-gray-50 align-top"
                      >
                        {/* Name */}
                        <td className="px-3 py-2">
                          {row.gr_device_name ?? "—"}
                        </td>

                        {/* Entity ID */}
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.ha_device_id}
                        </td>

                        {/* Domain */}
                        <td className="px-3 py-2">{row.domain ?? "—"}</td>

                        {/* Class */}
                        <td className="px-3 py-2">
                          {row.device_class ?? "—"}
                        </td>

                        {/* Derived Type */}
                        <td className="px-3 py-2">
                          {row.mapped_sensor_type ?? "—"}
                        </td>

                        {/* Equipment Mapping */}
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <select
                              className="border rounded px-2 py-1 text-xs bg-white"
                              value={row.equipment_id ?? ""}
                              disabled={savingMapFor === row.ha_device_id}
                              onChange={(e) =>
                                handleEquipmentMapChange(
                                  row.ha_device_id,
                                  e.target.value
                                )
                              }
                            >
                              <option value="">
                                — Unmapped —
                              </option>
                              {equipments.map((eq) => (
                                <option
                                  key={eq.equipment_id}
                                  value={eq.equipment_id}
                                >
                                  {eq.equipment_name}
                                </option>
                              ))}
                            </select>

                            <div className="text-[10px] text-gray-500">
                              {selectedEquipment ? (
                                <>
                                  Mapped to:{" "}
                                  <span className="font-semibold">
                                    {selectedEquipment.equipment_name}
                                  </span>
                                </>
                              ) : suggested ? (
                                <>
                                  Suggested:{" "}
                                  <span className="font-semibold">
                                    {suggested.equipment_name}
                                  </span>
                                </>
                              ) : (
                                "No suggestion"
                              )}
                            </div>
                          </div>
                        </td>

                        {/* State */}
                        <td className="px-3 py-2">
                          {row.last_state ?? "—"}
                        </td>

                        {/* Value */}
                        <td className="px-3 py-2">
                          {row.last_value ?? "—"}
                        </td>

                        {/* Unit */}
                        <td className="px-3 py-2">
                          {row.last_unit ?? "—"}
                        </td>

                        {/* Updated */}
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {row.last_updated_at
                            ? new Date(row.last_updated_at).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
