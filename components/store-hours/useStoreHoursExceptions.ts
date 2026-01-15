import { useEffect, useState } from "react";

export interface StoreHoursRow {
  site_id: string;
  occurrence_date?: string;   // past
  target_date?: string;       // future

  is_exception: boolean;
  exception_id: string | null;
  name: string;

  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;

  source_rule?: any;
}

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<{
    past: StoreHoursRow[];
    future: StoreHoursRow[];
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

      if (!pastRes.ok || !futureRes.ok) {
        throw new Error("Failed to fetch store hours");
      }

      const pastJson = await pastRes.json();
      const futureJson = await futureRes.json();

      setData({
        past: pastJson.rows ?? [],
        future: futureJson.rows ?? [],
      });

      setError(null);
    } catch (err: any) {
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
