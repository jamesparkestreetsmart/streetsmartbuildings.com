import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

export default async function EquipmentTable({ siteid }: { siteid: string }) {
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

  const { data: rows, error } = await supabase
    .from("view_sites_equipment")
    .select("*")
    .eq("site_id", siteid)
    .order("equipment_group", { ascending: true })
    .order("equipment_name", { ascending: true });

  if (error) {
    console.error("Error loading equipment:", error);
    return <div className="text-red-600">Error loading equipment data.</div>;
  }

  const data = rows ?? [];

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      <h2 className="text-xl font-semibold mb-4">Equipment Checkup</h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-3 px-4 font-semibold">Name</th>
            <th className="py-3 px-4 font-semibold">Group</th>
            <th className="py-3 px-4 font-semibold">Type</th>
            <th className="py-3 px-4 font-semibold">Space</th>
            <th className="py-3 px-4 font-semibold">Temp (°F)</th>
            <th className="py-3 px-4 font-semibold">Humidity (%)</th>
            <th className="py-3 px-4 font-semibold">Status</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row) => (
            <tr key={row.equipment_id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4 underline text-blue-700">
                <Link
                  href={`/sites/${siteid}/${row.equipment_id}`}
                  prefetch={false}
                >
                  {row.equipment_name}
                </Link>
              </td>

              <td className="py-3 px-4">{row.equipment_group ?? "—"}</td>
              <td className="py-3 px-4">{row.equipment_type ?? "—"}</td>
              <td className="py-3 px-4">{row.space_name ?? "—"}</td>
              <td className="py-3 px-4">{row.latest_temperature ?? "—"}</td>
              <td className="py-3 px-4">{row.latest_humidity ?? "—"}</td>
              <td className="py-3 px-4">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
