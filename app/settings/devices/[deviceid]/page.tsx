// app/settings/devices/[deviceid]/page.tsx (SERVER COMPONENT)

import DeviceDetailPageClient from "./devicedetailpageclient";

export default async function Page(props: { params: { deviceid: string } }) {
  const { deviceid } = await props.params; // ⬅ FIXES the PROMISE issue
  return <DeviceDetailPageClient deviceid={deviceid} />;
}
