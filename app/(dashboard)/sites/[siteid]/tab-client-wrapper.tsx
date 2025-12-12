"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useEffect, useState } from "react";
import EquipmentTable from "@/components/equipment/EquipmentTable";
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
          { label: "Store Hours", value: "hours" },
        ]}
        className="mb-6"
      />

      {/* TAB CONTENT */}
      {tab === "equipment" && <EquipmentTable siteId={siteId} />}
      {tab === "hours" && <StoreHoursManager siteId={siteId} />}
    </>
  );
}
