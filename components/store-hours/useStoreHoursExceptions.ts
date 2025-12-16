import { useEffect, useState } from "react";

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) return;

    setLoading(true);

    fetch(`/api/store-hours/exceptions?site_id=${siteId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load store hours exceptions");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  return { data, loading, error };
}
