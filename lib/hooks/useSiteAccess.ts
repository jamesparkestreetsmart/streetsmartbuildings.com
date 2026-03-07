"use client";

import { useState, useEffect } from "react";

/**
 * Check if the current user has access to a specific site.
 * Redirects to /sites if denied.
 */
export function useSiteAccess(
  orgId: string | null,
  siteId: string | null
): { allowed: boolean | null; loading: boolean } {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !siteId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/sites/check-access?org_id=${orgId}&site_id=${siteId}`)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 403) {
          setAllowed(false);
        } else {
          setAllowed(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAllowed(true); // fallback: don't block on error
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [orgId, siteId]);

  return { allowed, loading };
}
