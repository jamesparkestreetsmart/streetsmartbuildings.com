"use client";

import { useSearchParams, useRouter } from "next/navigation";
import AddDeviceForm from "@/components/devices/adddeviceform";
import { ArrowLeft } from "lucide-react";

export default function AddDevicePage() {
  const params = useSearchParams();
  const router = useRouter();

  const equipmentId = params.get("equipment");
  const siteId = params.get("site");

  return (
    <div className="p-6 space-y-6">

      {/* BACK BUTTON */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-xl font-semibold">Add Device</h1>

      {equipmentId && siteId ? (
        <AddDeviceForm siteId={siteId} equipmentId={equipmentId} />
      ) : (
        <p className="text-red-600 text-sm">
          Missing equipment or site ID in URL.
        </p>
      )}
    </div>
  );
}
