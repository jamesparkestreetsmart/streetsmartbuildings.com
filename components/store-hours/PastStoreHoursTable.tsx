"use client";


import { PastStoreHour } from "./usePastStoreHours";


interface Props {
rows: PastStoreHour[];
}


function formatDate(d: string) {
return new Date(d + "T00:00:00").toLocaleDateString();
}


function formatTime(t: string | null) {
if (!t) return "";
const [h, m] = t.split(":").map(Number);
const d = new Date();
d.setHours(h, m, 0, 0);
return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}


export function PastStoreHoursTable({ rows }: Props) {
if (!rows.length) {
return (
<div className="border rounded p-4 bg-white">
<h3 className="font-semibold mb-2">Past Store Hours</h3>
<p className="text-sm text-gray-500">No history</p>
</div>
);
}


return (
<div className="border rounded bg-white">
<div className="p-4 border-b font-semibold bg-green-50 text-green-900">Past Store Hours</div>


<table className="w-full text-sm">
<thead className="bg-gray-50 border-b">
<tr>
<th className="p-2 text-left">Name</th>
<th className="p-2">Date</th>
<th className="p-2">Hours</th>
</tr>
</thead>
<tbody>
{rows.map((r) => {
const hours = r.is_closed
? "Closed"
: `${formatTime(r.open_time)} – ${formatTime(r.close_time)}`;


return (
<tr
key={r.occurrence_id}
className={`border-b ${r.is_recent ? "bg-green-100 text-green-900" : ""}`}
>
<td className="p-2">{r.name ?? "Base hours"}</td>
<td className="p-2 text-center">{formatDate(r.occurrence_date)}</td>
<td className="p-2 text-center">{hours}</td>
</tr>
);
})}
</tbody>
</table>
</div>
);
}