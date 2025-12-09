// app/sites/[siteid]/devices/[ha_device_id]/page.tsx

export const dynamic = "force-dynamic";

export default async function DevicePage({
  params,
}: {
  params: Promise<{
    siteid: string;
    ha_device_id: string;
  }>;
}) {
  // ✅ MUST await params in Next.js 15
  const { siteid, ha_device_id } = await params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Device Details</h1>

      <div className="mt-4 space-y-1 text-sm text-gray-600">
        <div>
          <span className="font-semibold">Site ID:</span> {siteid}
        </div>
        <div>
          <span className="font-semibold">HA Device ID:</span> {ha_device_id}
        </div>
      </div>
    </div>
  );
}
