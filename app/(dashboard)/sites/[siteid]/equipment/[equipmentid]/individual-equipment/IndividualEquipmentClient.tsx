"use client";

import AddRecordNote from "@/components/AddRecordNote";

export default function IndividualEquipmentClient({
  orgId,
  siteid,
  equipmentid,
  returnTo,
}: {
  orgId: string | null;
  siteid: string;
  equipmentid: string;
  returnTo?: string;
}) {
  return (
    <div className="p-6">
      <AddRecordNote
        orgId={orgId}
        siteId={siteid}
        equipmentId={equipmentid}
      />
    </div>
  );
}
