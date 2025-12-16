"use client";

import { useStoreHoursExceptions } from "./useStoreHoursExceptions";
import ExceptionTable from "./ExceptionTable";
import StoreHoursChangeLog from "./StoreHoursChangeLog";

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  // existing weekly store hours logic stays untouched

  const { data, loading, error } = useStoreHoursExceptions(siteId);

  if (loading) return <div>Loading exceptions…</div>;
  if (error) return <div>{error}</div>;
  if (!data) return null;

  return (
    <>
      {/* existing weekly store hours UI */}

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

        <StoreHoursChangeLog rows={data.change_log.rows} />
      </div>
    </>
  );
}
