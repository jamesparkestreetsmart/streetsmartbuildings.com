"use client";

import { useState, useEffect } from "react";

interface SiteScopeResult {
  scope: "all" | string[] | null;
  loading: boolean;
  cause?: "no_memberships" | "no_sites_linked";
}

/**
 * Client hook for UI convenience only — NOT enforcement.
 * Server-side scope is the primary security layer.
 */
export function useSiteScope(orgId: string | null): SiteScopeResult {
  const [scope, setScope] = useState<"all" | string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cause, setCause] = useState<"no_memberships" | "no_sites_linked" | undefined>();

  useEffect(() => {
    if (!orgId) {
      setScope(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/user/site-scope?org_id=${orgId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setScope(data.scope);
        setCause(data.cause);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setScope("all"); // fallback: don't block on error
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [orgId]);

  return { scope, loading, cause };
}
