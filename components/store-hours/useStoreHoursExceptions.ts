import { useEffect, useState } from "react";

/* ======================================================
   Types
====================================================== */

export interface StoreHoursRowDB {
  occurrence_id: string;
  site_id: string;
  occurrence_date: string | null;
  exception_id: string | null;
  name: string | null;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  source_rule?: any;
  is_recent?: boolean;
}

export interface ExceptionOccurrenceUI {
  occurrence_id: string;
  exception_id: string | null;
  site_id: string;
  name: string;
  date: string; // YYYY-MM-DD
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_recurring: boolean;
  is_recent?: boolean;
  source_rule?: any;
}

/* ======================================================
   Helpers
====================================================== */

function isWithinLast7Days(dateStr?: string): boolean {
  if (!dateStr) return false;

  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();

  const diffMs = today.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= 0 && diffDays <= 7;
}

/* ======================================================
   Hook
====================================================== */

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<{
    past: ExceptionOccurrenceUI[];
    future: ExceptionOccurrenceUI[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    try {
      setLoading(true);

      const [pastRes, futureRes] = await Promise.all([
        fetch(`/api/store-hours/past?site_id=${siteId}`, { cache: "no-store" }),
        fetch(`/api/store-hours/future?site_id=${siteId}`, { cache: "no-store" }),
      ]);

      if (!pastRes.ok) throw new Error("Failed to fetch past store hours");
      if (!futureRes.ok) throw new Error("Failed to fetch future store hours");

      const pastJson = await pastRes.json();
      const futureJson = await futureRes.json();

      const pastRows: ExceptionOccurrenceUI[] = (pastJson.rows ?? [])
        .map((r: StoreHoursRowDB) => ({
          occurrence_id: r.occurrence_id,
          exception_id: r.exception_id,
          site_id: r.site_id,
          name: r.name ?? "Base Hours",
          date: r.occurrence_date!,
          open_time: r.open_time,
          close_time: r.close_time,
          is_closed: r.is_closed,
          is_recurring: Boolean(r.source_rule?.recurrence_rule),
          is_recent: isWithinLast7Days(r.occurrence_date ?? undefined),
          source_rule: r.source_rule,
        }));

      const futureRows: ExceptionOccurrenceUI[] = (futureJson.rows ?? []).map(
        (r: any) => ({
          occurrence_id: r.occurrence_id,
          exception_id: r.exception_id,
          site_id: r.site_id,
          name: r.name ?? "Unnamed exception",
          date: r.event_date,
          open_time: r.open_time,
          close_time: r.close_time,
          is_closed: r.is_closed,
          is_recurring: Boolean(r.source_rule?.recurrence_rule),
          is_recent: false,
          source_rule: r.source_rule,
        })
      );

      setData({
        past: pastRows,
        future: futureRows,
      });

      setError(null);
    } catch (err: any) {
      console.error("useStoreHoursExceptions error:", err);
      setError(err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!siteId) return;
    fetchData();
  }, [siteId]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
