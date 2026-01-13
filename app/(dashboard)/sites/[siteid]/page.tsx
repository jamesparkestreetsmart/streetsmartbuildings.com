import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import TabClientWrapper from "./tab-client-wrapper";

export const dynamic = "force-dynamic";

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

  /** ============================
   *  FETCH SITE INFORMATION
   * ============================ */
  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", id)
    .single();

  if (siteError || !site) {
    console.error("Site load error:", siteError);
    return <div className="p-6 text-red-600">Error loading site.</div>;
  }

  /** ============================
   *  FETCH INFRASTRUCTURE EQUIPMENT (FIXED)
   * ============================ */
  const { data: infrastructureEquipment } = await supabase
    .from("a_equipments")
    .select("equipment_id, equipment_name, equipment_group, equipment_type, status")
    .eq("site_id", id)
    .eq("equipment_group", "Infrastructure")
    .order("equipment_name");

  /** ============================
   *  WEATHER LOOKUP
   * ============================ */
  let weatherSummary = "Weather data unavailable";

  try {
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        site.city
      )}&count=1&language=en&format=json`
    );

    const geoData = await geoResponse.json();
    const lat = geoData.results?.[0]?.latitude;
    const lon = geoData.results?.[0]?.longitude;

    if (lat && lon) {
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
      );
      const weatherData = await weatherResponse.json();

      const tempC = weatherData?.current_weather?.temperature;
      const wind = weatherData?.current_weather?.windspeed;

      if (tempC !== undefined && wind !== undefined) {
        const tempF = (tempC * 9) / 5 + 32;
        weatherSummary = `🌤️ ${tempF.toFixed(1)}°F • Wind ${wind.toFixed(1)} mph`;
      }
    }
  } catch (err) {
    console.error("Weather fetch error:", err);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="w-full rounded-lg bg-gradient-to-r from-green-600 to-yellow-500 p-6 grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr_0.8fr] gap-6">

        {/* LEFT — Site Info */}
        <div>
          <h1 className="text-3xl font-bold text-white">{site.site_name}</h1>

          <div className="mt-2 text-sm text-white space-y-1">
            <p><span className="font-semibold">Brand:</span> {site.brand || "—"}</p>
            <p><span className="font-semibold">Industry:</span> {site.industry || "—"}</p>
          </div>

          <p className="text-white mt-3">
            {site.address_line1}
            {site.address_line2 ? `, ${site.address_line2}` : ""},{" "}
            {site.city}, {site.state} {site.postal_code}
          </p>

          <p className="text-white mt-1">{site.phone_number}</p>

          <span className="mt-2 inline-block bg-black/40 text-white text-xs font-semibold px-3 py-1 rounded-md">
            {site.timezone || "CST"}
          </span>
        </div>

        {/* CENTER — Weather + Buttons */}
        <div className="flex flex-col items-end justify-between">

          <div className="text-right">
            <h2 className="font-semibold text-white text-lg">Weather</h2>
            <p className="text-white text-sm">{weatherSummary}</p>
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
              Sync Devices & Gateways
            </Link>
          </div>
        </div>

        {/* RIGHT — Infrastructure Matrix */}
        <div className="bg-white/95 rounded-md shadow p-3 text-xs">

          <div className="font-semibold text-gray-800 mb-2">
            Infrastructure Overview
          </div>

          <div className="grid grid-cols-4 font-semibold text-gray-600 border-b pb-1 mb-1">
            <div>Group</div>
            <div>Type</div>
            <div>Name</div>
            <div>Status</div>
          </div>

          <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-gray-800">
            {infrastructureEquipment?.length ? (
              infrastructureEquipment.map((eq, i) => (
                <div key={i} className="grid grid-cols-4 gap-2">
                  <div>{eq.equipment_group}</div>
                  <div>{eq.equipment_type}</div>
                  <div className="truncate" title={eq.equipment_name}>
                    <Link
                      href={`/sites/${id}/equipment/${eq.equipment_id}/individual-equipment`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {eq.equipment_name}
                    </Link>
                  </div>
                  <div
                    className={
                      eq.status === "active"
                        ? "text-green-600"
                        : eq.status === "inactive"
                        ? "text-yellow-600"
                        : "text-gray-500"
                    }
                  >
                    {eq.status}
                  </div>
                </div>
              ))
            ) : (
              <div className="italic text-gray-500">No infrastructure equipment</div>
            )}
          </div>
        </div>

      </header>

      {/* MAIN CONTENT */}
      <main className="p-6">
        <TabClientWrapper siteId={id} />
      </main>
    </div>
  );
}
