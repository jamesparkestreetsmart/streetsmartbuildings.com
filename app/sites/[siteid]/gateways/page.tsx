// app/sites/[siteid]/gateways/page.tsx
import GatewayClientPage from "./GatewayClientPage";

export const dynamic = "force-dynamic";
export default async function Page(props: any) {
  const { siteid } = await props.params;
  return <GatewayClientPage siteid={siteid} />;
}
