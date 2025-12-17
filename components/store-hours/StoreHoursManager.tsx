// components/store-hours/StoreHoursManager.tsx

"use client";

import WeeklyStoreHours from "./WeeklyStoreHours";
import { useStoreHoursExceptions } from "./useStoreHoursExceptions";
import ExceptionTable from "./ExceptionTable";

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  const { data, loading, error } = useStoreHoursExceptions(siteId);

  if (loading) return <div>Loading store hours…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!data?.this_year || !data?.last_year) {
    return <div>Invalid exception data</div>;
  }

  return (
    <>
      {/* 1️⃣ WEEKLY SCHEDULE */}
      <WeeklyStoreHours siteId={siteId} />

      {/* 2️⃣ EXCEPTIONS */}
      <div className="mt-10 grid grid-cols-3 gap-6">
        <ExceptionTable
          title={`This Year (${data.this_year.year})`}
          exceptions={data.this_year.exceptions}
        />

        <ExceptionTable
          title={`Last Year (${data.last_year.year})`}
          exceptions={data.last_year.exceptions}
          readOnly
        />

        {/* Change log intentionally omitted (Option B) */}
      </div>
    </>
  );
}
