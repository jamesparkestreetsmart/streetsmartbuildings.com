"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Organization {
  org_id: string;
  org_name: string;
  org_identifier: string;
}

interface OrgContextType {
  orgs: Organization[];
  selectedOrgId: string | null;
  selectedOrg: Organization | null;
  setSelectedOrgId: (id: string | null) => void;
  loading: boolean;
  isServiceProvider: boolean;
  userEmail: string | null;
}

const OrgContext = createContext<OrgContextType>({
  orgs: [],
  selectedOrgId: null,
  selectedOrg: null,
  setSelectedOrgId: () => {},
  loading: true,
  isServiceProvider: false,
  userEmail: null,
});

export function useOrg() {
  return useContext(OrgContext);
}

export function OrgProvider({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string | null;
}) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isServiceProvider, setIsServiceProvider] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      // Get the current auth user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error("OrgContext: no auth user", authError);
        setLoading(false);
        return;
      }

      // Get all orgs the user has a direct membership in
      const { data: memberships, error: memError } = await supabase
        .from("a_orgs_users_memberships")
        .select("org_id, role, status")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (memError || !memberships || memberships.length === 0) {
        console.error("OrgContext: no memberships", memError);
        setOrgs([]);
        setLoading(false);
        return;
      }

      const orgIds = memberships.map((m) => m.org_id);

      // Get org details for the user's memberships
      const { data: userOrgs, error: orgError } = await supabase
        .from("a_organizations")
        .select("org_id, org_name, org_identifier, parent_org_id")
        .in("org_id", orgIds)
        .order("org_name");

      if (orgError || !userOrgs) {
        console.error("OrgContext: failed to fetch orgs", orgError);
        setOrgs([]);
        setLoading(false);
        return;
      }

      // Check if user belongs to a root org (parent_org_id IS NULL)
      const hasRootMembership = userOrgs.some((o: any) => o.parent_org_id === null);

      let allOrgs: Organization[] = [];

      if (hasRootMembership) {
        // Service provider: get ALL orgs
        setIsServiceProvider(true);

        const { data: allOrgData } = await supabase
          .from("a_organizations")
          .select("org_id, org_name, org_identifier")
          .order("org_name");

        allOrgs = (allOrgData || []) as Organization[];
      } else {
        // Regular user: only their orgs
        allOrgs = userOrgs.map((o: any) => ({
          org_id: o.org_id,
          org_name: o.org_name,
          org_identifier: o.org_identifier,
        }));
      }

      setOrgs(allOrgs);

      // Auto-select if only one org
      if (allOrgs.length === 1) {
        setSelectedOrgId(allOrgs[0].org_id);
      }
    } catch (err) {
      console.error("OrgContext: unexpected error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  // Try to restore selection from sessionStorage
  useEffect(() => {
    if (orgs.length === 0) return;
    const saved = sessionStorage.getItem("selectedOrgId");
    if (saved && orgs.some((o) => o.org_id === saved)) {
      setSelectedOrgId(saved);
    }
  }, [orgs]);

  // Persist selection
  useEffect(() => {
    if (selectedOrgId) {
      sessionStorage.setItem("selectedOrgId", selectedOrgId);
    }
  }, [selectedOrgId]);

  const selectedOrg = orgs.find((o) => o.org_id === selectedOrgId) || null;

  return (
    <OrgContext.Provider
      value={{
        orgs,
        selectedOrgId,
        selectedOrg,
        setSelectedOrgId,
        loading,
        isServiceProvider,
        userEmail: userEmail || null,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
