// app/settings/devices/[deviceid]/page.tsx (SERVER COMPONENT)

import DeviceDetailPageClient from "./devicedetailpageclient";

export default async function Page(
  { params }: { params: Promise<{ deviceid: string }> }
) {
  const { deviceid } = await params;

  return <DeviceDetailPageClient deviceid={deviceid} />;
}
