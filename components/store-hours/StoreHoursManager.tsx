"use client";

import StoreHoursCalendar from "./StoreHoursCalendar";
import { useState } from "react";
import WeeklyStoreHours from "./WeeklyStoreHours";
import { useStoreHoursExceptions } from "./useStoreHoursExceptions";
import ExceptionTable from "./ExceptionTable";
import ExceptionModal, {
  ExceptionModalMode,
} from "./ExceptionModal";

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  const { data, loading, error, refetch } = useStoreHoursExceptions(siteId);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ExceptionModalMode>("create");
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  if (loading) return <div>Loading store hours…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) {
    return <div>Invalid exception data</div>;
  }

  return (
    <>
      {/* 1️⃣ WEEKLY STORE HOURS */}
      <WeeklyStoreHours siteId={siteId} />

      {/* 2️⃣ EXCEPTIONS */}
      <div className="mt-10 space-y-6">
        {/* CALENDAR */}
        <div className="border rounded-lg p-4 bg-white">
          <StoreHoursCalendar
            occurrences={data.all}
            onSelectDate={(date, list) => {
              // If user clicks a day with existing exception → edit first one
              if (list.length > 0) {
                const ex = list[0] as any;
                setModalMode(
                  ex.source_rule?.is_recurring
                    ? "edit-recurring-forward"
                    : "edit-one-time"
                );
                setModalInitialData(ex);
              } else {
                // Otherwise create new exception for this date
                setModalMode("create");
                setModalInitialData({ exception_date: date });
              }
              setModalOpen(true);
            }}
          />
        </div>

        {/* TABLES */}
        <div className="grid grid-cols-3 gap-6">
          {/* LEFT — PAST (Last year + past this year) */}
          <ExceptionTable
            title="Past Exceptions"
            exceptions={data.past}
            readOnly
          />

          {/* CENTER — FUTURE (This year forward + next year) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Upcoming Exceptions</h3>

              <button
                className="px-3 py-1.5 rounded-md text-sm font-semibold
                           bg-green-600 text-white hover:bg-green-700"
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
              exceptions={data.future}
              onEdit={(ex) => {
                setModalMode(
                  ex.source_rule?.is_recurring
                    ? "edit-recurring-forward"
                    : "edit-one-time"
                );
                setModalInitialData(ex);
                setModalOpen(true);
              }}
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
            refetch(); // immediate refresh
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
