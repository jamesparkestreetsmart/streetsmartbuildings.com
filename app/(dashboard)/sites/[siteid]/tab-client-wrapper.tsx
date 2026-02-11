"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import EquipmentTable from "@/components/equipment/EquipmentTable";
import SpaceHvacTable from "@/components/equipment/SpaceHvacTable";
import PlumbingTable from "@/components/equipment/PlumbingTable";
import StoreHoursManager from "@/components/store-hours/StoreHoursManager";
import HvacZoneSetpointsTable from "@/components/equipment/HvacZoneSetpointsTable";
import InventoryTab from "@/components/inventory/InventoryTab";
import SiteActivityLog from "@/components/SiteActivityLog";
import LogicMapTimeline from "@/components/equipment/LogicMapTimeline";

export default function TabClientWrapper({ siteId }: { siteId: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [tab, setTab] = useState(params.get("tab") || "");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [siteStatus, setSiteStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchSiteInfo = async () => {
      const { data } = await supabase
        .from("a_sites")
        .select("org_id, status")
        .eq("site_id", siteId)
        .single();

      if (data) {
        setOrgId(data.org_id);
        setSiteStatus(data.status);
      }
      setLoaded(true);
    };
    fetchSiteInfo();
  }, [siteId]);

  useEffect(() => {
    if (!loaded || !siteStatus) return;

    const urlTab = params.get("tab");
    const isInventorySite = siteStatus === "inventory";

    if (isInventorySite) {
      setTab("inventory");
    } else if (!urlTab) {
      setTab("equipment");
    } else {
      setTab(urlTab);
    }
  }, [loaded, siteStatus, params]);

  const updateTab = (value: string) => {
    setTab(value);
    router.replace(`?tab=${value}`, { scroll: false });
  };

  if (!loaded) {
    return <div className="text-gray-500 text-sm py-4">Loading...</div>;
  }

  const isInventorySite = siteStatus === "inventory";

  const tabOptions = isInventorySite
    ? [{ label: "Inventory", value: "inventory" }]
    : [
        { label: "Equipment Checkup", value: "equipment" },
        { label: "Space & HVAC", value: "space-hvac" },
        { label: "Logic Map", value: "logic-map" },
        { label: "Plumbing", value: "plumbing" },
        { label: "Store Hours", value: "hours" },
        { label: "Activity Log", value: "activity" },
      ];

  return (
    <>
      {tabOptions.length > 1 ? (
        <SegmentedControl
          value={tab}
          onChange={updateTab}
          options={tabOptions}
          className="mb-6"
        />
      ) : (
        <div className="mb-6" />
      )}

      {tab === "equipment" && !isInventorySite && (
        <EquipmentTable siteId={siteId} />
      )}
      {tab === "space-hvac" && !isInventorySite && (
        <>
          <HvacZoneSetpointsTable siteId={siteId} orgId={orgId || ""} />
          <SpaceHvacTable siteId={siteId} />
        </>
      )}
      {tab === "logic-map" && !isInventorySite && (
        <LogicMapTimeline siteId={siteId} />
      )}
      {tab === "inventory" && isInventorySite && (
        <InventoryTab siteId={siteId} mode="org" />
      )}
      {tab === "plumbing" && !isInventorySite && (
        <PlumbingTable siteId={siteId} />
      )}
      {tab === "hours" && !isInventorySite && (
        <StoreHoursManager siteId={siteId} />
      )}
      {tab === "activity" && !isInventorySite && (
        <SiteActivityLog siteId={siteId} />
      )}
    </>
  );
}
