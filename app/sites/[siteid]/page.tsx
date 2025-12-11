// app/sites/[siteid]/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import EquipmentTable from "@/components/equipment/EquipmentTable";
import TabClientWrapper from "./tab-client-wrapper"; // NEW — client tab handler

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

  /** ============================
   *        RETURN PAGE
   * ============================ */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="w-full rounded-lg bg-gradient-to-r from-green-600 to-yellow-500 p-6 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* LEFT — Site Info */}
        <div>
          <h1 className="text-3xl font-bold text-white">{site.site_name}</h1>
          <p className="text-white mt-1">
            {site.address_line1}
            {site.address_line2 ? `, ${site.address_line2}` : ""},{" "}
            {site.city}, {site.state} {site.postal_code}
          </p>
          <p className="text-white mt-1">{site.phone_number}</p>
        </div>

        {/* WEATHER */}
        <div className="text-right mr-6">
          <h2 className="font-semibold text-white text-lg">Weather</h2>
          <p className="text-white text-sm flex items-center justify-end gap-1">
            {weatherSummary}
          </p>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-col gap-2 self-start md:self-auto">
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
      </header>

      {/* MAIN CONTENT — TABS */}
      <main className="p-6">
        <TabClientWrapper siteId={id} />
      </main>
    </div>
  );
}
