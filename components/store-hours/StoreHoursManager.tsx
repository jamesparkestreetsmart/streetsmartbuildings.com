// components/store-hours/StoreHoursManager.tsx
"use client";

import { useState } from "react";
import WeeklyStoreHours from "./WeeklyStoreHours";
import { useStoreHoursExceptions } from "./useStoreHoursExceptions";
import ExceptionTable from "./ExceptionTable";
import ExceptionModal, { ExceptionModalMode } from "./ExceptionModal";

/* ======================================================
   Helpers
====================================================== */

function getRowDate(row: any): string | null {
  const d = row.occurrence_date ?? row.target_date;
  if (!d || isNaN(new Date(d).getTime())) return null;
  return d;
}

function normalizeRows(list: any[]) {
  return list
    .map((e) => {
      const date = getRowDate(e);
      if (!date) return null;

      return {
        occurrence_id: e.occurrence_id ?? `${e.site_id}-${date}`,
        exception_id: e.exception_id,
        site_id: e.site_id,

        // canonical UI date
        date,

        name: e.name + (e.is_recurring ? " (Recurring)" : " (One-time)"),
        open_time: e.open_time,
        close_time: e.close_time,
        is_closed: e.is_closed,
        is_recurring: e.is_recurring ?? false,
        is_recent: e.is_recent ?? false,
        source_rule: e.source_rule,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

}

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  const { data, loading, error, refetch } = useStoreHoursExceptions(siteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ExceptionModalMode>("create");
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  if (loading) return <div>Loading store hours…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div>Invalid exception data</div>;

  /* ======================================================
     Normalize + sort
  ====================================================== */

  const pastRows = normalizeRows(data.past);
  const futureRows = normalizeRows(data.future);

  const pastSorted = [...pastRows].sort((a: any, b: any) =>
    b.date.localeCompare(a.date)
  );

  const futureSorted = [...futureRows].sort((a: any, b: any) =>
    a.date.localeCompare(b.date)
  );

  /* ======================================================
     Delete handler
  ====================================================== */

  async function handleDelete(ex: any) {
    try {
      const res = await fetch(
        `/api/store-hours/exceptions?exception_id=${ex.exception_id}`,
        { method: "DELETE" }
      );

      const json = await res.json();
      console.log("DELETE response:", json);

      if (!res.ok) {
        alert(json.error || "Failed to delete exception");
        return;
      }

      await refetch();
    } catch (err) {
      console.error(err);
      alert("Failed to delete exception");
    }
  }

  return (
    <>
      {/* 1️⃣ WEEKLY STORE HOURS */}
      <WeeklyStoreHours siteId={siteId} />

      {/* 2️⃣ EXCEPTIONS */}
      <div className="mt-10 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          {/* LEFT — PAST */}
          <ExceptionTable
            title="Past Exceptions"
            exceptions={pastSorted}
            readOnly
          />

          {/* CENTER — FUTURE */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Upcoming Exceptions</h3>

              <button
                className="px-3 py-1.5 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700"
                onClick={() => {
                  setModalMode("create");
                  setModalInitialData(null);
                  setModalOpen(true);
                }}
              >
                + Add Exception
              </button>
            </div>

            <ExceptionTable
              title=""
              exceptions={futureSorted}
              onEdit={(ex) => {
                const baseName = ex.name.replace(
                  /\s+\((Recurring|One-time)\)$/,
                  ""
                );

                const normalized = {
                  occurrence_id: ex.occurrence_id,
                  exception_id: ex.exception_id,
                  site_id: ex.site_id,
                  name: baseName,
                  is_closed: ex.is_closed,
                  open_time: ex.open_time,
                  close_time: ex.close_time,
                  is_recurring: ex.is_recurring,

                  exception_date: ex.date,

                  recurrence_rule: ex.is_recurring
                    ? ex.source_rule?.recurrence_rule ?? null
                    : null,

                  effective_from_date: ex.date,
                };

                setModalMode(
                  ex.is_recurring
                    ? "edit-recurring-forward"
                    : "edit-one-time"
                );

                setModalInitialData(normalized);
                setModalOpen(true);
              }}
              onDelete={handleDelete}
            />
          </div>

          {/* RIGHT — PLACEHOLDER */}
          <div className="border rounded bg-gray-50 flex items-center justify-center text-sm text-gray-400">
            Change log coming soon
          </div>
        </div>
      </div>

      {/* 3️⃣ MODAL */}
      {modalOpen && (
        <ExceptionModal
          open={modalOpen}
          siteId={siteId}
          mode={modalMode}
          initialData={modalInitialData}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            refetch();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
