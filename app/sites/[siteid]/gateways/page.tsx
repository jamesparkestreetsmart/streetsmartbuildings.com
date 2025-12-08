// app/sites/[siteid]/gateways/page.tsx
import GatewayClientPage from "./GatewayClientPage";

export const dynamic = "force-dynamic";

export default function Page({
  params,
}: {
  params: { siteid: string };
}) {
  return <GatewayClientPage siteid={params.siteid} />;
}
