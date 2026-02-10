"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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
  isAdmin: boolean;
  userEmail: string | null;
}

const OrgContext = createContext<OrgContextType>({
  orgs: [],
  selectedOrgId: null,
  selectedOrg: null,
  setSelectedOrgId: () => {},
  loading: true,
  isAdmin: false,
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

  const isAdmin = userEmail?.endsWith("@streetsmartbuildings.com") ?? false;

  const fetchOrgs = useCallback(async () => {
    try {
      if (isAdmin) {
        // Admin sees all orgs
        const res = await fetch("/api/admin/organizations");
        const data = await res.json();
        setOrgs(
          (data.organizations || []).map((o: any) => ({
            org_id: o.org_id,
            org_name: o.org_name,
            org_identifier: o.org_identifier,
          }))
        );
      } else {
        // Normal user sees their orgs via membership
        const res = await fetch("/api/user/organizations");
        const data = await res.json();
        setOrgs(data.organizations || []);
        // Auto-select first org for normal users
        if (data.organizations?.length === 1) {
          setSelectedOrgId(data.organizations[0].org_id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch orgs:", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  // Try to restore selection from sessionStorage
  useEffect(() => {
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
        isAdmin,
        userEmail: userEmail || null,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
