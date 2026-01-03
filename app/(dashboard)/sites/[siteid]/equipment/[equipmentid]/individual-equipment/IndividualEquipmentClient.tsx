"use client";

import AddRecordNote from "@/components/AddRecordNote";

interface IndividualEquipmentClientProps {
  orgId: string | null;
  siteid: string;
  equipmentid: string;
  returnTo?: string; // ✅ optional, for navigation context
}

export default function IndividualEquipmentClient({
  orgId,
  siteid,
  equipmentid,
  returnTo, // eslint-disable-line @typescript-eslint/no-unused-vars
}: IndividualEquipmentClientProps) {
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
