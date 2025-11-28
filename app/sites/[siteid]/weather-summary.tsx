// app/sites/[siteid]/weather-summary.tsx

export default async function WeatherSummary() {
  const lat = 42.6;   // temporary placeholder
  const lon = -83.9;

  let weather = null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
      { cache: "no-store" }
    );
    weather = await res.json();
  } catch (e) {
    console.error("Weather fetch failed:", e);
  }

  if (!weather?.current_weather) {
    return (
      <div className="bg-white rounded-xl p-6 shadow border text-gray-500">
        Weather data unavailable
      </div>
    );
  }

  const w = weather.current_weather;

  return (
    <div className="bg-white rounded-xl p-6 shadow border">
      <h2 className="text-xl font-semibold mb-2">Current Weather</h2>

      <div className="text-gray-800 space-y-1">
        <p>
          <strong>Temp:</strong> {w.temperature}°F
        </p>
        <p>
          <strong>Wind:</strong> {w.windspeed} mph
        </p>
      </div>
    </div>
  );
}
