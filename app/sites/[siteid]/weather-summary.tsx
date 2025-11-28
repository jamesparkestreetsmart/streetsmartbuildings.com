// app/sites/[siteid]/weather-summary.tsx

export default async function WeatherSummary() {
  // Replace with DB later
  const lat = 42.61;
  const lon = -83.93;

  let data = null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`,
      { cache: "no-store" }
    );
    data = await res.json();
  } catch (err) {
    console.error("Weather API failed:", err);
  }

  if (!data) {
    return (
      <div className="bg-white p-6 rounded-xl shadow border text-gray-500">
        Weather data unavailable
      </div>
    );
  }

  const current = data.current_weather;
  const humidity = data.hourly?.relativehumidity_2m?.[0];

  return (
    <div className="bg-white p-6 rounded-xl shadow border">
      <h2 className="text-xl font-semibold mb-2">Current Weather</h2>

      <p><strong>Temp:</strong> {current.temperature}°F</p>
      <p><strong>Wind:</strong> {current.windspeed} mph</p>
      <p><strong>Humidity:</strong> {humidity}%</p>
    </div>
  );
}
