// app/sites/[siteid]/gateways/page.tsx
import GatewayClientPage from "./GatewayClientPage";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ siteid: string }>;
}) {
  const { siteid } = await params;
  return <GatewayClientPage siteid={siteid} />;
}
