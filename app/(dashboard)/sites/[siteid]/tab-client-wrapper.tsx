"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useEffect, useState } from "react";
import EquipmentTable from "@/components/equipment/EquipmentTable";
import SpaceHvacTable from "@/components/equipment/SpaceHvacTable";
import PlumbingTable from "@/components/equipment/PlumbingTable";
import StoreHoursManager from "@/components/store-hours/StoreHoursManager";

export default function TabClientWrapper({ siteId }: { siteId: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const initialTab = params.get("tab") || "equipment";
  const [tab, setTab] = useState(initialTab);

  // Update URL without full reload
  const updateTab = (value: string) => {
    setTab(value);
    router.replace(`?tab=${value}`, { scroll: false });
  };

  return (
    <>
      {/* TABS */}
      <SegmentedControl
        value={tab}
        onChange={updateTab}
        options={[
          { label: "Equipment Checkup", value: "equipment" },
          { label: "Space & HVAC", value: "space-hvac" },
          { label: "Plumbing", value: "plumbing" },
          { label: "Store Hours", value: "hours" },
        ]}
        className="mb-6"
      />

      {/* TAB CONTENT */}
      {tab === "equipment" && <EquipmentTable siteId={siteId} />}
      {tab === "space-hvac" && <SpaceHvacTable siteId={siteId} />}
      {tab === "plumbing" && <PlumbingTable siteId={siteId} />}
      {tab === "hours" && <StoreHoursManager siteId={siteId} />}
    </>
  );
}
