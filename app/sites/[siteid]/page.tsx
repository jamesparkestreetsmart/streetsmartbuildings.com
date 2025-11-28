// app/sites/[siteid]/page.tsx

export default async function SitePage(
  props: { params: Promise<{ siteid: string }> }
) {
  const { siteid } = await props.params;
  console.log("BUILD HIT [siteid]/page.tsx");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Site Overview</h1>

      <div className="bg-white rounded-xl shadow p-6 border">
        <p className="text-gray-700 mb-2">
          <strong>Dynamic Site ID:</strong> {siteid}
        </p>

        <p className="text-gray-500">
          This page will eventually show:
        </p>

        <ul className="list-disc ml-6 text-gray-600 mt-2">
          <li>Site header with address & phone</li>
          <li>Real-time weather summary</li>
          <li>Equipment table</li>
        </ul>
      </div>
    </div>
  );
}
