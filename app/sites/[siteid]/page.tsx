// app/sites/[siteid]/page.tsx

export default function SitePage({
  params,
}: {
  params: { siteid: string };
}) {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Site detail page</h1>
      <p>Dynamic site ID: <code>{params.siteid}</code></p>
    </div>
  );
}
