import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({ params }: any) {
  // Vercel may wrap params in a Promise; dev will not.
  const resolved = await params;
  const siteid = resolved?.siteid;
  const equipmentid = resolved?.equipmentid;

  console.log("Equipment Page Params:", { siteid, equipmentid });

  if (!siteid || !equipmentid) {
    return (
      <div className="p-6 text-red-600">
        Missing site or equipment ID in URL.
      </div>
    );
  }

  // Supabase server client
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

  // Fetch equipment details from view
  const { data: eq, error } = await supabase
    .from("view_sites_equipment")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single();

  if (error || !eq) {
    console.error("Equipment fetch error:", error);
    return (
      <div className="p-6 text-red-600">
        Could not load equipment details.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER WITH GRADIENT */}
      <header className="bg-gradient-to-r from-green-600 to-yellow-400 text-white p-6 shadow-lg">
        <h1 className="text-3xl font-bold">{eq.equipment_name}</h1>
        <p className="opacity-90 text-sm mt-1">
          {eq.equipment_group} • {eq.equipment_type}
        </p>

        <div className="mt-3 flex gap-3">
          <Link
            href={`/sites/${siteid}/equipment`}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm"
          >
            ← Back to Equipment List
          </Link>

          <Link
            href={`/sites/${siteid}/equipment/${equipmentid}/edit`}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm"
          >
            ✎ Edit Equipment
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-6 max-w-5xl mx-auto space-y-6">

        {/* EQUIPMENT CARD */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <h2 className="text-xl font-semibold mb-4">Equipment Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
            <p>
              <strong>Group:</strong> {eq.equipment_group ?? "—"}
            </p>
            <p>
              <strong>Type:</strong> {eq.equipment_type ?? "—"}
            </p>
            <p>
              <strong>Space:</strong> {eq.space_name ?? "—"}
            </p>
            <p>
              <strong>Model:</strong> {eq.model ?? "—"}
            </p>
            <p>
              <strong>Serial:</strong> {eq.serial_number ?? "—"}
            </p>
            <p>
              <strong>Voltage:</strong> {eq.voltage ?? "—"}
            </p>
            <p>
              <strong>Amperage:</strong> {eq.amperage ?? "—"}
            </p>
            <p>
              <strong>Status:</strong> {eq.status}
            </p>
          </div>
        </div>

        {/* SENSOR VALUES */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <h2 className="text-xl font-semibold mb-4">Latest Sensor Readings</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-gray-700">

            <div>
              <p className="font-semibold">Temperature (°F)</p>
              <p>{eq.latest_temperature ?? "—"}</p>
              <p className="text-xs text-gray-500">
                Updated:{" "}
                {eq.latest_temperature_ts
                  ? new Date(eq.latest_temperature_ts).toLocaleString()
                  : "No data"}
              </p>
            </div>

            <div>
              <p className="font-semibold">Humidity (%)</p>
              <p>{eq.latest_humidity ?? "—"}</p>
              <p className="text-xs text-gray-500">
                Updated:{" "}
                {eq.latest_humidity_ts
                  ? new Date(eq.latest_humidity_ts).toLocaleString()
                  : "No data"}
              </p>
            </div>

            <div>
              <p className="font-semibold">Binary State</p>
              <p>{eq.latest_binary_state ?? "—"}</p>
              <p className="text-xs text-gray-500">
                Updated:{" "}
                {eq.latest_binary_state_ts
                  ? new Date(eq.latest_binary_state_ts).toLocaleString()
                  : "No data"}
              </p>
            </div>
          </div>
        </div>

        {/* DEVICES LIST (placeholder) */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <h2 className="text-xl font-semibold mb-4">Devices</h2>

          <p className="text-gray-600 mb-2">
            Devices tied to this equipment will appear here.
          </p>

          <Link
            href={`/sites/${siteid}/equipment/${equipmentid}/devices`}
            className="text-blue-600 underline text-sm"
          >
            View devices →
          </Link>
        </div>

      </main>
    </div>
  );
}
