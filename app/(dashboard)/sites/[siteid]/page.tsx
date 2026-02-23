import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import TabClientWrapper from "./tab-client-wrapper";
import AddEquipmentButton from "@/components/equipment/AddEquipmentButton";
import SiteInventoryPanel from "@/components/inventory/SiteInventoryPanel";

export const dynamic = "force-dynamic";

function getWeatherIcon(sunElevation: number, cloudCover: number, lux: number): string {
  if (sunElevation < 0 || lux === 0) return "🌙";
  if (cloudCover < 20) return "☀️";
  if (cloudCover < 60) return "⛅";
  if (cloudCover < 85) return "☁️";
  return "🌥️";
}

function formatLux(lux: number): string {
  if (lux === 0) return "0 lux";
  return lux.toLocaleString() + " lux";
}

function luxToLevel(lux: number): number {
  if (lux < 100) return 1;
  if (lux < 400) return 2;
  if (lux < 1000) return 3;
  if (lux < 10000) return 4;
  return 5;
}

const LUX_BAR_COLORS: Record<number, string> = {
  1: "bg-gray-400",
  2: "bg-yellow-300",
  3: "bg-yellow-400",
  4: "bg-amber-500",
  5: "bg-yellow-300",
};

function LuxLevelBars({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`inline-block w-1 h-2.5 rounded-sm ${
            i <= level ? LUX_BAR_COLORS[level] : "bg-white/30"
          }`}
        />
      ))}
      <span className="ml-0.5 text-white/90 text-xs font-semibold">L{level}</span>
    </span>
  );
}

export default async function SitePage(props: any) {
  const params = await props.params;
  const id = params?.siteid;

  if (!id) {
    return <div className="p-6 text-red-600">Error loading site: missing site ID.</div>;
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", id)
    .single();

  if (siteError || !site) {
    console.error("Site load error:", siteError);
    return <div className="p-6 text-red-600">Error loading site.</div>;
  }

  const isInventorySite = site.status === "inventory";

  // Fetch org info
  let orgName = "";
  let orgAddress = "";
  if (site.org_id) {
    const { data: org } = await supabase
      .from("a_organizations")
      .select("org_name, billing_street, billing_city, billing_state, billing_postal_code")
      .eq("org_id", site.org_id)
      .single();
    orgName = org?.org_name || "";
    if (org) {
      orgAddress = [org.billing_street, org.billing_city, org.billing_state, org.billing_postal_code]
        .filter(Boolean)
        .join(", ");
    }
  }

  // Infrastructure equipment (operational sites only)
  let infrastructureEquipment: any[] = [];
  if (!isInventorySite) {
    const { data } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_group, equipment_type_id, status")
      .eq("site_id", id)
      .eq("equipment_group", "Infrastructure")
      .order("equipment_name");
    infrastructureEquipment = data || [];
  }

  // Weather from today's manifest (same data the Logic Map displays)
  let weatherText: string | null = null;
  let weatherLux: number | null = null;
  if (!isInventorySite) {
    const tz = site.timezone || "America/Chicago";
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });

    const svcSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: manifestRow } = await svcSupabase
      .from("b_store_hours_manifests")
      .select("operations_manifest")
      .eq("site_id", id)
      .eq("manifest_date", todayStr)
      .single();

    const w = manifestRow?.operations_manifest?.weather;
    if (w?.temperature != null) {
      const sunEl = w.sun_elevation ?? 0;
      const cloud = w.cloud_cover ?? 0;
      const lux = w.lux_estimate ?? 0;
      weatherLux = lux;
      const icon = getWeatherIcon(sunEl, cloud, lux);
      const parts = [`${Math.round(w.temperature)}°F`];
      if (w.feels_like != null) {
        parts.push(`Feels ${Math.round(w.feels_like)}°F`);
      }
      if (w.wind_speed != null) {
        parts.push(`Wind ${Math.round(w.wind_speed)} mph`);
      }
      parts.push(formatLux(lux));
      weatherText = `${icon} ${parts.join(" · ")}`;
    }
  }

  // Address for display
  const addressParts = [
    site.address_line1, site.address_line2,
    [site.city, site.state].filter(Boolean).join(", "),
    site.postal_code,
  ].filter(Boolean);
  const fullAddress = addressParts.join(", ");

  return (
    <div className="min-h-screen bg-gray-50">
      {isInventorySite ? (
        /* ─── INVENTORY SITE HEADER ─── */
        <header className="w-full rounded-lg bg-gradient-to-r from-green-600 to-yellow-500 p-6 flex items-start justify-between">
          <div>
            {orgName && (
              <p className="text-white/80 text-sm font-medium tracking-wide uppercase mb-1">
                {orgName}
              </p>
            )}
            <h1 className="text-3xl font-bold text-white">Inventory</h1>
            {orgAddress && (
              <p className="text-white/90 mt-2 text-sm">{orgAddress}</p>
            )}
            <span className="mt-2 inline-block bg-black/40 text-white text-xs font-semibold px-3 py-1 rounded-md">
              {site.timezone || "America/Chicago"}
            </span>
          </div>

          <Link
            href="/sites"
            className="px-4 py-2 bg-white/90 hover:bg-white text-green-700 font-semibold rounded-md shadow text-center text-sm"
          >
            ← Back
          </Link>
        </header>
      ) : (
        /* ─── OPERATIONAL SITE HEADER ─── */
        <header className="w-full rounded-lg bg-gradient-to-r from-green-600 to-yellow-500 p-6 grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr_0.8fr] gap-6">

          {/* LEFT — Site Info */}
          <div>
            {orgName && (
              <p className="text-white/80 text-sm font-medium tracking-wide uppercase mb-1">
                {orgName}
              </p>
            )}

            <h1 className="text-3xl font-bold text-white">{site.site_name}</h1>

            {fullAddress && (
              <p className="text-white/90 mt-2 text-sm">{fullAddress}</p>
            )}

            {/* Brand / Industry / Back */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {site.brand && (
                <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur-sm">
                  Brand: {site.brand}
                </span>
              )}
              {site.industry && (
                <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur-sm">
                  Industry: {site.industry}
                </span>
              )}
              <Link
                href="/sites"
                className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur-sm hover:bg-white/30"
              >
                ← Back to Sites
              </Link>
            </div>

            <span className="mt-2 inline-block bg-black/40 text-white text-xs font-semibold px-3 py-1 rounded-md">
              {site.timezone || "America/Chicago"}
            </span>
          </div>

          {/* CENTER — Weather + Buttons */}
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <h2 className="font-semibold text-white text-lg">Weather</h2>
              <p className="text-white text-sm inline-flex items-center flex-wrap gap-x-1">
                {weatherText ? (
                  <>
                    {weatherText}
                    {weatherLux !== null && <LuxLevelBars level={luxToLevel(weatherLux)} />}
                  </>
                ) : (
                  "Weather data unavailable"
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Link
                href={`/sites/${id}/edit`}
                className="px-4 py-2 bg-white/90 hover:bg-white text-green-700 font-semibold rounded-md shadow text-center"
              >
                Edit Site
              </Link>
              <Link
                href={`/sites/${id}/gateways`}
                className="px-4 py-2 bg-white/90 hover:bg-white text-blue-700 font-semibold rounded-md shadow text-center"
              >
                Sync Devices &amp; Gateways
              </Link>
              <AddEquipmentButton siteId={id} />
            </div>
          </div>

          {/* RIGHT — Infrastructure + Inventory Panels */}
          <div className="space-y-3">
            {/* Infrastructure Overview */}
            <div className="bg-white/95 rounded-md shadow p-3 text-xs">
              <div className="font-semibold text-gray-800 mb-2">
                Infrastructure Overview
              </div>
              <div className="grid grid-cols-4 font-semibold text-gray-600 border-b pb-1 mb-1">
                <div>Group</div><div>Type</div><div>Name</div><div>Status</div>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-gray-800">
                {infrastructureEquipment?.length ? (
                  infrastructureEquipment.map((eq, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2">
                      <div>{eq.equipment_group}</div>
                      <div>{eq.equipment_type_id}</div>
                      <div className="truncate" title={eq.equipment_name}>
                        <Link
                          href={`/sites/${id}/equipment/${eq.equipment_id}/individual-equipment`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {eq.equipment_name}
                        </Link>
                      </div>
                      <div className={
                        eq.status === "active" ? "text-green-600" :
                        eq.status === "inactive" ? "text-yellow-600" : "text-gray-500"
                      }>
                        {eq.status}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="italic text-gray-500">No infrastructure equipment</div>
                )}
              </div>
            </div>

            {/* Inventory Spaces Panel */}
            <SiteInventoryPanel siteId={id} />
          </div>
        </header>
      )}

      {/* MAIN CONTENT */}
      <main className="p-6">
        <TabClientWrapper siteId={id} />
      </main>
    </div>
  );
}
