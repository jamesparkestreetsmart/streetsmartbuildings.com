// app/sites/[siteid]/weather-summary.tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface WeatherSummaryProps {
  site: {
    address: string;
    city?: string;
    state?: string;
  };
}

export default async function WeatherSummary({ site }: WeatherSummaryProps) {
  // You can later store lat/lon in DB. For now, use placeholder coords.
  const lat = 42.6;
  const lon = -83.9;

  const weatherApiKey = process.env.OPENWEATHER_API_KEY;

  let weather = null;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=imperial`,
      { cache: "no-store" }
    );
    weather = await res.json();
  } catch (e) {
    console.error("Weather fetch failed:", e);
  }

  if (!weather) {
    return (
      <div className="bg-white rounded-xl p-6 shadow border text-gray-500">
        Weather data unavailable
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow border">
      <h2 className="text-xl font-semibold mb-2">Current Weather</h2>

      <div className="text-gray-800 space-y-1">
        <p>
          <strong>Temp:</strong> {weather.main.temp}°F
        </p>
        <p>
          <strong>Feels Like:</strong> {weather.main.feels_like}°F
        </p>
        <p>
          <strong>Humidity:</strong> {weather.main.humidity}%
        </p>
        <p>
          <strong>Wind:</strong> {weather.wind.speed} mph
        </p>
      </div>
    </div>
  );
}
