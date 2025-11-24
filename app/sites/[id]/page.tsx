// app/sites/[id]/page.tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import EquipmentTable from "./equipment-table";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: { id: string }; 
}) {
  const { id } = params; 

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

  if (siteError || !site)
    return <div className="p-6 text-red-600">Error loading site.</div>;

  // Weather (unchanged)
  let weatherSummary = "Weather data unavailable";

  try {
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        site.city
      )}&count=1&language=en&format=json`,
      { cache: "no-store" }
    );

    let lat = null;
    let lon = null;

    if (geoResponse?.ok) {
      const geoData = await geoResponse.json();
      lat = geoData?.results?.[0]?.latitude ?? null;
      lon = geoData?.results?.[0]?.longitude ?? null;
    }

    if (lat && lon) {
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
        { cache: "no-store" }
      );

      if (weatherResponse?.ok) {
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
    }
  } catch {}

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-green-600 to-yellow-400 text-white p-6 shadow-lg">
        {/* ADDED md:flex-nowrap AND flex-shrink-0 to ensure horizontal space for all elements */}
        <div className="flex flex-col md:flex-row md:flex-nowrap md:items-center md:justify-between gap-6">

          {/* LEFT SIDE — SITE INFO */}
          <div className="flex flex-col gap-2 flex-shrink">
            <h1 className="text-2xl font-bold">{site.site_name}</h1>
            <p className="text-sm opacity-90">
              {site.address_line1}
              {site.address_line2 ? `, ${site.address_line2}` : ""}, {site.city},{" "}
              {site.state} {site.postal_code}
            </p>
            <p className="text-sm opacity-90">
              {site.phone_number || "No phone on file"}
            </p>
          </div>

          {/* RIGHT SIDE — WEATHER & ACTIONS */}
          <div className="flex items-center gap-4 flex-shrink-0">

            {/* WEATHER */}
            <div className="bg-white/20 rounded-xl p-3 shadow-inner text-right">
              <p className="font-semibold text-sm">Weather</p>
              <p className="text-sm opacity-90">{weatherSummary}</p>
            </div>

            {/* EDIT BUTTON (Now more visible with an icon and guaranteed space) */}
            <Link
              href={`/sites/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-green-700 font-medium shadow hover:bg-gray-100 transition duration-150"
            >
              <span className="text-lg">✏️</span>
              Edit Site
            </Link>

          </div>
        </div>
      </header>

      <main className="p-6">
        <EquipmentTable siteId={id} />
      </main>
    </div>
  );
}