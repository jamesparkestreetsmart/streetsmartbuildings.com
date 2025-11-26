// app/sites/[siteid]/page.tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import EquipmentTable from "./equipment-table";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: { siteid: string };
}) {
  // TEMP DEBUG: this WILL show in Vercel logs
  console.error("🔥 SERVER HIT: /sites/[siteid], params =", params);

  const id = params.siteid;

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

  // ----------------------------
  // Fetch site
  // ----------------------------
  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", id)
    .single();

  if (siteError || !site) return notFound();

  // ----------------------------
  // Weather fetch
  // ----------------------------
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

    if (geoResponse.ok) {
      const geoData = await geoResponse.json();
      lat = geoData?.results?.[0]?.latitude ?? null;
      lon = geoData?.results?.[0]?.longitude ?? null;
    }

    if (lat && lon) {
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
        { cache: "no-store" }
      );

      if (weatherResponse.ok) {
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

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-green-600 to-yellow-400 text-white p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{site.site_name}</h1>
            <p className="text-sm opacity-90">
              {site.address_line1}
              {site.address_line2 ? `, ${site.address_line2}` : ""},{" "}
              {site.city}, {site.state} {site.postal_code}
            </p>
            <p className="text-sm opacity-90">
              {site.phone_number || "No phone on file"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white/20 rounded-xl p-3 shadow-inner text-right">
              <p className="font-semibold text-sm">Weather</p>
              <p className="text-sm opacity-90">{weatherSummary}</p>
            </div>

            <Link
              href={`/sites/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-green-700 font-medium shadow hover:bg-gray-100 transition"
            >
              <span className="text-lg">✏️</span>
              Edit Site
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6">
        <EquipmentTable siteid={id} />
      </main>
    </div>
  );
}
