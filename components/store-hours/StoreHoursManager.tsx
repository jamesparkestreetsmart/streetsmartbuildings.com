"use client";

import { useState } from "react";
import WeeklyStoreHours from "./WeeklyStoreHours";
import { useStoreHoursExceptions } from "./useStoreHoursExceptions";
import ExceptionTable from "./ExceptionTable";
import ExceptionModal, { ExceptionModalMode } from "./ExceptionModal";

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  const { data, loading, error, refetch } = useStoreHoursExceptions(siteId);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ExceptionModalMode>("create");
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  if (loading) return <div>Loading store hours…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div>Invalid exception data</div>;

  function toExceptionRow(list: any[]) {
    return list.map((e) => ({
      ...e,
      resolved_date: e.date,
      day_of_week: new Date(e.date).toLocaleDateString("en-US", {
        weekday: "long",
      }),
      name: e.name + (e.is_recurring ? " (Recurring)" : " (One-time)"),
    }));
  }

  // Sort helpers
  const pastSorted = [...data.past].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const futureSorted = [...data.future].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  /* ======================================================
     Delete handler
  ====================================================== */

  async function handleDelete(ex: any) {
    try {
      const res = await fetch(
        `/api/store-hours-exceptions?exception_id=${ex.exception_id}`,
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
            exceptions={toExceptionRow(pastSorted)}
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
              exceptions={toExceptionRow(futureSorted)}
              onEdit={(ex) => {
                const baseName = ex.name.replace(
                  /\s+\((Recurring|One-time)\)$/,
                  ""
                );

                const normalized = {
                  exception_id: ex.exception_id,
                  site_id: ex.site_id,
                  name: baseName,
                  is_closed: ex.is_closed,
                  open_time: ex.open_time,
                  close_time: ex.close_time,
                  is_recurring: ex.is_recurring,

                  // the actual occurrence date that was clicked
                  exception_date: ex.date,

                  recurrence_rule: ex.is_recurring
                    ? ex.source_rule?.recurrence_rule ?? null
                    : null,

                  // IMPORTANT: forward-edit starts from THIS occurrence
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
