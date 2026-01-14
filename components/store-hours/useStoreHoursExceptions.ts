import { useEffect, useState } from "react";

export interface ExceptionOccurrence {
  exception_id: string;
  site_id: string;
  name: string;
  date: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_recurring: boolean;
  source_rule?: any;
}

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<{
    past: ExceptionOccurrence[];
    future: ExceptionOccurrence[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    try {
      setLoading(true);

      const res = await fetch(
        `/api/store-hours/exceptions?site_id=${siteId}`
      );

      if (!res.ok) {
        throw new Error("Failed to fetch exceptions");
      }

      const json = await res.json();

      setData({
        past: json.past ?? [],
        future: json.future ?? [],
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
