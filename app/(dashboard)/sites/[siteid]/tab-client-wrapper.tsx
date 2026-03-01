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
import ProfileManager from "@/components/hvac/ProfileManager";
import InventoryTab from "@/components/inventory/InventoryTab";
import SiteActivityLog from "@/components/SiteActivityLog";
import LogicMap from "@/components/logic-map/LogicMap";
import AnomalyThresholdsPanel from "@/components/AnomalyThresholdsPanel";
import CompressorCycleTable from "@/components/equipment/CompressorCycleTable";
import AnomalyEventsTable from "@/components/equipment/AnomalyEventsTable";

export default function TabClientWrapper({ siteId }: { siteId: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [tab, setTab] = useState(params.get("tab") || "");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [siteStatus, setSiteStatus] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>("America/Chicago");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchSiteInfo = async () => {
      const { data } = await supabase
        .from("a_sites")
        .select("org_id, status, timezone")
        .eq("site_id", siteId)
        .single();

      if (data) {
        setOrgId(data.org_id);
        setSiteStatus(data.status);
        setTimezone(data.timezone || "America/Chicago");
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
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0">
              <ProfileManager orgId={orgId || ""} />
            </div>
            <div className="w-[380px] flex-shrink-0">
              <AnomalyThresholdsPanel siteId={siteId} orgId={orgId || ""} />
            </div>
          </div>
          <HvacZoneSetpointsTable siteId={siteId} orgId={orgId || ""} />
          <SpaceHvacTable siteId={siteId} />
          <CompressorCycleTable siteId={siteId} />
          <AnomalyEventsTable siteId={siteId} />
        </>
      )}
      {tab === "logic-map" && !isInventorySite && (
        <LogicMap siteId={siteId} timezone={timezone} />
      )}
      {tab === "inventory" && isInventorySite && (
        <InventoryTab siteId={siteId} mode="org" />
      )}
      {tab === "plumbing" && !isInventorySite && (
        <PlumbingTable siteId={siteId} />
      )}
      {tab === "hours" && !isInventorySite && (
        <StoreHoursManager siteId={siteId} timezone={timezone} orgId={orgId || ""} />
      )}
      {tab === "activity" && !isInventorySite && (
        <SiteActivityLog siteId={siteId} />
      )}
    </>
  );
}

