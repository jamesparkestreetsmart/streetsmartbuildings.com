import { useEffect, useState, useCallback } from "react";

export type ExceptionOccurrence = {
  exception_id: string;
  site_id: string;
  name: string;
  date: string; // resolved date (YYYY-MM-DD)
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_recurring: boolean;
  rule?: any;
  ui_state: {
    is_past: boolean;
    is_editable: boolean;
    requires_forward_only_edit: boolean;
  };
};

export function useStoreHoursExceptions(siteId: string) {
  const [data, setData] = useState<{
    past: ExceptionOccurrence[];
    future: ExceptionOccurrence[];
    all: ExceptionOccurrence[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/store-hours/exceptions?site_id=${siteId}`,
        { credentials: "include" }
      );

      if (!res.ok) throw new Error("Failed to load store hours exceptions");

      const json = await res.json();

      // Expect API to return expanded occurrences
      const occurrences: ExceptionOccurrence[] = json.occurrences ?? [];

      const today = new Date().toISOString().slice(0, 10);

      const normalized = occurrences.map((e) => {
        const isPast = e.date < today;

        return {
          ...e,
          ui_state: {
            is_past: isPast,
            is_editable: !isPast,
            requires_forward_only_edit: false,
          },
        };
      });

      const past = normalized.filter((e) => e.ui_state.is_past);
      const future = normalized.filter((e) => !e.ui_state.is_past);

      setData({
        past,
        future,
        all: normalized,
      });
    } catch (err: any) {
      console.error("Exception load error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
