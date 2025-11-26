// app/sites/[siteid]/page.tsx

export default async function SitePage(props: { params: Promise<{ siteid: string }> }) {
  const { siteid } = await props.params;

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Site detail page</h1>
      <p>Dynamic site ID: <code>{siteid}</code></p>
    </div>
  );
}
