export default function EquipmentIdPlaceholderPage({
  params,
}: {
  params: { equipmentid: string };
}) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Equipment Overview</h1>
      <p className="mt-2 text-gray-700">
        This is a placeholder page for equipment ID:
        <span className="font-mono ml-2 px-2 py-1 bg-gray-100 rounded">
          {params.equipmentid}
        </span>
      </p>

      <p className="mt-6 text-gray-500">
        The full detail page is located at:
      </p>

      <pre className="bg-gray-100 p-3 rounded mt-2 text-sm">
        /equipment/{`{equipmentid}`}/individual-equipment
      </pre>
    </div>
  );
}
