// app/sites/[siteid]/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import EquipmentTable from "@/components/equipment/EquipmentTable";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteid: string }>;
}) {
  // FIX — Correct params handling
  const { siteid: id } = await params;

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
   *  ============================ */
  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", id)
    .single();

  if (siteError || !site)
    return <div className="p-6 text-red-600">Error loading site.</div>;

  /** ============================
   *        WEATHER LOOKUP
   *  ============================ */
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
        weatherSummary = `🌤️ ${tempF.toFixed(1)}°F • Wind ${wind.toFixed(
          1
        )} mph`;
      }
    }
  } catch (err) {
    console.error("Weather fetch error:", err);
  }

  /** ============================
   *        RETURN PAGE
   *  ============================ */
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

        {/* MIDDLE-RIGHT — Weather */}
        <div className="text-right mr-6">
          <h2 className="font-semibold text-white text-lg">Weather</h2>
          <p className="text-white text-sm flex items-center justify-end gap-1">
            {weatherSummary}
          </p>
        </div>

        {/* FAR RIGHT — Edit Site Button */}
        <Link
          href={`/sites/${id}/edit`}
          className="px-4 py-2 bg-white/90 hover:bg-white text-green-700 font-semibold rounded-md shadow self-start md:self-auto"
        >
          Edit Site
        </Link>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-6">
        <EquipmentTable siteId={id} />
      </main>
    </div>
  );
}
