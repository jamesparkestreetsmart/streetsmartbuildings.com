import { useEffect, useState, useCallback } from "react";

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExceptions = useCallback(() => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/store-hours/exceptions?site_id=${siteId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load store hours exceptions");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
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
    fetchExceptions();
  }, [fetchExceptions]);

  return {
    data,
    loading,
    error,
    refetch: fetchExceptions, // ✅ this is what StoreHoursManager expects
  };
}
