"use client";

import { useState } from "react";
import WeeklyStoreHours from "./WeeklyStoreHours";

import { usePastStoreHours } from "./usePastStoreHours";
import { useFutureExceptions } from "./useFutureExceptions";

import { PastStoreHoursTable } from "./PastStoreHoursTable";
import FutureExceptionsTable from "./FutureExceptionsTable";
import { FutureException } from "./useFutureExceptions";

import ExceptionModal, { ExceptionModalMode } from "./ExceptionModal";

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  const past = usePastStoreHours(siteId);
  const future = useFutureExceptions(siteId);

  /* ---------------- Debugging (optional) ---------------- */

  const badRows = future.rows.filter(
    (r) => typeof r?.event_date !== "string" || !r.event_date
  );

  if (badRows.length) {
    console.warn("Dropping bad future rows:", badRows);
  }

  console.log("future rows:", future.rows);

  /* ------------------------------------------------------ */

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ExceptionModalMode>("create");
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  if (past.loading || future.loading) return <div>Loading store hours…</div>;
  if (past.error) return <div className="text-red-600">{past.error}</div>;
  if (future.error) return <div className="text-red-600">{future.error}</div>;

  const pastSorted = [...past.rows].sort((a, b) =>
    b.occurrence_date.localeCompare(a.occurrence_date)
  );

  const futureSorted = [...future.rows]
    .filter(
      (r) => typeof r?.event_date === "string" && r.event_date.length > 0
    )
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  async function handleDelete(ex: any) {
    try {
      const res = await fetch(
        `/api/store-hours/exceptions?exception_id=${ex.exception_id}`,
        { method: "DELETE" }
      );

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "Failed to delete exception");
        return;
      }

      await future.refetch();
    } catch (err) {
      console.error(err);
      alert("Failed to delete exception");
    }
  }

  return (
    <>
      {/* 1️⃣ WEEKLY STORE HOURS */}
      <WeeklyStoreHours siteId={siteId} />

      {/* 2️⃣ STORE HOURS + EXCEPTIONS */}
      <div className="mt-10 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          {/* LEFT — PAST (history) */}
          <PastStoreHoursTable rows={pastSorted} />

          {/* CENTER — FUTURE (events) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Upcoming Events</h3>

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

            <FutureExceptionsTable
              title=""
              exceptions={futureSorted}
              onEdit={(ex: FutureException) => {
                const normalized = {
                  exception_id: ex.exception_id,
                  site_id: ex.site_id,
                  name: ex.name,
                  is_closed: ex.is_closed,
                  open_time: ex.open_time,
                  close_time: ex.close_time,
                  is_recurring: Boolean(ex.source_rule?.recurrence_rule),

                  exception_date: ex.event_date,
                  recurrence_rule: ex.source_rule?.recurrence_rule ?? null,
                  effective_from_date: ex.event_date,
                };

                setModalMode(
                  ex.source_rule?.recurrence_rule
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
          onSaved={async () => {
            await future.refetch();
            await past.refetch();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
