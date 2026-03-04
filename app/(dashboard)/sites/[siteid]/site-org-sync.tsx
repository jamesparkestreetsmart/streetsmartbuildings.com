"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";

/**
 * Invisible component that auto-switches the org selector
 * to match the org that owns the currently viewed site.
 */
export default function SiteOrgSync({ siteId }: { siteId: string }) {
  const { selectedOrgId, setSelectedOrgId, orgs } = useOrg();

  useEffect(() => {
    if (orgs.length === 0) return;

    async function sync() {
      const { data } = await supabase
        .from("a_sites")
        .select("org_id")
        .eq("site_id", siteId)
        .single();

      if (data?.org_id && data.org_id !== selectedOrgId) {
        if (orgs.some((o) => o.org_id === data.org_id)) {
          setSelectedOrgId(data.org_id);
        }
      }
    }

    sync();
  }, [siteId, selectedOrgId, setSelectedOrgId, orgs]);

  return null;
}
