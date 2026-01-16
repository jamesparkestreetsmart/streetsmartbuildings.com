import { useEffect, useState } from "react";


export interface PastStoreHour {
occurrence_id: string;
site_id: string;
occurrence_date: string;
exception_id: string | null;
name: string | null;
open_time: string | null;
close_time: string | null;
is_closed: boolean;
is_recent: boolean;
}


function isWithinLast7Days(dateStr: string): boolean {
const d = new Date(dateStr + "T00:00:00");
const today = new Date();
const diffDays = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
return diffDays >= 0 && diffDays <= 7;
}


export function usePastStoreHours(siteId: string) {
const [rows, setRows] = useState<PastStoreHour[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);


async function fetchRows() {
try {
setLoading(true);


const res = await fetch(`/api/store-hours/past?site_id=${siteId}`, {
cache: "no-store",
});


if (!res.ok) throw new Error("Failed to fetch past store hours");


const json = await res.json();


const mapped: PastStoreHour[] = (json.rows ?? []).map((r: any) => ({
occurrence_id: r.occurrence_id,
site_id: r.site_id,
occurrence_date: r.occurrence_date,
exception_id: r.exception_id,
name: r.name,
open_time: r.open_time,
close_time: r.close_time,
is_closed: r.is_closed,
is_recent: isWithinLast7Days(r.occurrence_date),
}));


setRows(mapped);
setError(null);
} catch (e: any) {
setError(e.message ?? "Unknown error");
} finally {
setLoading(false);
}
}


useEffect(() => {
if (siteId) fetchRows();
}, [siteId]);


return { rows, loading, error, refetch: fetchRows };
}