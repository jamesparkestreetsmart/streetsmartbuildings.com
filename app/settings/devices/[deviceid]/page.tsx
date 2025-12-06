/// app/settings/devices/[deviceid]/page.tsx

import DeviceDetailPageClient from "./devicedetailpageclient";

interface DevicePageProps {
  params: Promise<{
    deviceid: string;
  }>;
}

export default async function Page({ params }: DevicePageProps) {
  const { deviceid } = await params;

  return <DeviceDetailPageClient deviceid={deviceid} />;
}
