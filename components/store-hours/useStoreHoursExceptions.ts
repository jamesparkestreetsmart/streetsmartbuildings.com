import { useEffect, useState, useCallback } from "react";

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<{ past: any[]; future: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/store-hours/exceptions?site_id=${siteId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load store hours exceptions");
        return res.json();
      })
      .then((json) => {
        const lastYear = json.last_year?.exceptions ?? [];
        const thisYear = json.this_year?.exceptions ?? [];

        const today = new Date().toISOString().slice(0, 10);

        // 🔑 Normalize so ui_state ALWAYS exists
        const normalize = (e: any) => {
          const resolvedDate = e.resolved_date;

          const isPast =
            resolvedDate && resolvedDate < today;

          return {
            ...e,
            ui_state: e.ui_state ?? {
              is_past: isPast,
              is_editable: !isPast,
              requires_forward_only_edit: false,
            },
          };
        };

        const normalizedLastYear = lastYear.map(normalize);
        const normalizedThisYear = thisYear.map(normalize);

        const past = [
          ...normalizedLastYear,
          ...normalizedThisYear.filter(
            (e: any) => e.ui_state.is_past
          ),
        ];

        const future = normalizedThisYear.filter(
          (e: any) => !e.ui_state.is_past
        );

        setData({ past, future });
      })
      .catch((err) => {
        console.error("Exception load error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
