export default function StoreHoursChangeLog({ rows }: { rows: any[] }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">Change Log</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {rows.map((row) => (
          <li key={row.log_id}>
            {new Date(row.changed_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
