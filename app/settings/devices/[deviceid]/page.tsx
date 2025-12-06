// app/settings/devices/[deviceid]/page.tsx

import DeviceDetailPageClient from "./devicedetailpageclient";

// Use 'any' to force compilation and avoid the build-time type conflict.
export default async function Page(props: any) {
  const params = await props.params;
  // Access the parameter directly. It will be { deviceid: string }.
  // Using optional chaining (?) is a good safety measure when using 'any'.
  const deviceid = params?.deviceid;

  if (!deviceid) {
     // Optional: Add an error check if the ID is unexpectedly missing
     return <div>Error: Device ID not found</div>;
  }

  return <DeviceDetailPageClient deviceid={deviceid} />;
}