import { useEffect, useState, useCallback } from "react";

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/store-hours/exceptions/occurrences?site_id=${siteId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load store hours exceptions");
        }
        return res.json();
      })
      .then((json) => {
        const past = [
          ...(json.last_year?.exceptions ?? []),
          ...(json.this_year?.exceptions ?? []).filter(
            (e: any) => e.ui_state?.is_past
          ),
        ];

        const future = (json.this_year?.exceptions ?? []).filter(
          (e: any) => !e.ui_state?.is_past
        );

        setData({ past, future });
      })
      .catch((err) => {
        console.error("Exception load error:", err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
