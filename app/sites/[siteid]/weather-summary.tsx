// app/sites/[siteid]/weather-summary.tsx

interface WeatherSummaryProps {
  site: {
    address: string;
    city?: string;
    state?: string;
  };
}

export default async function WeatherSummary({ site }: WeatherSummaryProps) {
  // temporary placeholder weather (static)
  const weather = {
    temp: 72,
    feels_like: 70,
    humidity: 55,
    wind: 8,
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow border">
      <h2 className="text-xl font-semibold mb-2">Current Weather</h2>

      <p><strong>Address:</strong> {site.address}</p>

      <div className="text-gray-800 space-y-1 mt-3">
        <p>
          <strong>Temp:</strong> {weather.temp}°F
        </p>
        <p>
          <strong>Feels Like:</strong> {weather.feels_like}°F
        </p>
        <p>
          <strong>Humidity:</strong> {weather.humidity}%
        </p>
        <p>
          <strong>Wind:</strong> {weather.wind} mph
        </p>
      </div>
    </div>
  );
}
