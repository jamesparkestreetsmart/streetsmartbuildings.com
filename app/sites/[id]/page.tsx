import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import EquipmentTable from "./equipment-table";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // ───────────── Fetch Site Info ─────────────
  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", id)
    .single();

  if (siteError || !site)
    return <div className="p-6 text-red-600">Error loading site.</div>;

  // ───────────── Fetch Weather Data ─────────────
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

  // ───────────── Render ─────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-green-600 to-yellow-400 text-white p-6 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold">{site.site_name}</h1>
    <p className="text-sm opacity-90">
      {site.address_line1}
      {site.address_line2 ? `, ${site.address_line2}` : ""}, {site.city}, {site.state} {site.postal_code}
    </p>
    <p className="text-sm opacity-90">{site.phone_number || "No phone on file"}</p>
  </div>

  <div className="bg-white/20 rounded-xl p-4 shadow-inner text-right">
    <p className="font-semibold text-lg">Weather</p>
    <p className="text-sm opacity-90">{weatherSummary}</p>
  </div>
</header>

      <main className="p-6">
        <EquipmentTable siteId={id} />
      </main>
    </div>
  );
}
