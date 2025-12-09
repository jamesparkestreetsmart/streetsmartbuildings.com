// app/sites/[siteid]/gateways/page.tsx
import GatewayClientPage from "./GatewayClientPage";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: { siteid: string };
}) {
  const { siteid } = params;
  return <GatewayClientPage siteid={siteid} />;
}
