// app/sites/[siteid]/devices/[ha_device_id]/page.tsx

export const dynamic = "force-dynamic";

export default async function DevicePage({
  params,
}: {
  params: { siteid: string; ha_device_id: string };
}) {
  const { siteid, ha_device_id } = params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Device Details</h1>
      <p className="mt-2 text-sm text-gray-600">
        Site: {siteid}
      </p>
      <p className="text-sm text-gray-600">
        HA Device ID: {ha_device_id}
      </p>
    </div>
  );
}
