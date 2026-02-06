"use client";

import { useState } from "react";
import WeeklyStoreHours from "./WeeklyStoreHours";
import UpcomingEventsTable from "./UpcomingEventsTable";
import { PastEventsTable } from "./PastEventsTable";

import AddEventModal, { AddEventModalMode } from "./AddEventModal";
import { useFutureExceptions, FutureException } from "./useFutureExceptions";
import { usePastStoreHours } from "./usePastStoreHours";

function EventsDisclaimer() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm rounded p-3">
      Events are generated from schedules. Editing or deleting an event affects
      the schedule and all future occurrences. Past events are shown for reference.
    </div>
  );
}

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  const upcoming = useFutureExceptions(siteId);
  const past = usePastStoreHours(siteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AddEventModalMode>("create");
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  if (upcoming.loading || past.loading) return <div>Loading store hours…</div>;
  if (upcoming.error) return <div className="text-red-600">{upcoming.error}</div>;
  if (past.error) return <div className="text-red-600">{past.error}</div>;

  async function handleDelete(e: FutureException) {
    if (!confirm("Delete this schedule and all future events?")) return;

    // NOTE: This assumes you have (or will create) this route:
    // DELETE /api/store-hours/rules/[rule_id]
    const res = await fetch(`/api/store-hours/rules/${e.rule_id}`, {
      method: "DELETE",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete schedule");
      return;
    }

    await upcoming.refetch();
    await past.refetch();
  }

  function handleEdit(e: FutureException) {
    // NOTE: your modal should edit the RULE (schedule),
    // not the individual event. We pass enough info to locate rule_id + site_id.
    setModalMode("edit-rule" as any); // if your modal union doesn't include it yet
    setModalInitialData({
      rule_id: e.rule_id,
      site_id: e.site_id,
      // you can hydrate full rule details by fetching rule_id inside modal if needed
    });
    setModalOpen(true);
  }

  return (
    <>
      {/* Weekly base hours stays separate */}
      <WeeklyStoreHours siteId={siteId} />

      <div className="mt-10 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          {/* LEFT — Past events */}
          <PastEventsTable rows={past.rows} />

          {/* CENTER — Upcoming events */}
          <div className="flex flex-col gap-3">
            <EventsDisclaimer />

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
                + Add Event
              </button>
            </div>

            <UpcomingEventsTable
              rows={upcoming.rows}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>

          {/* RIGHT — placeholder */}
          <div className="border rounded bg-gray-50 flex items-center justify-center text-sm text-gray-400">
            Change log coming soon
          </div>
        </div>
      </div>

      {modalOpen && (
        <AddEventModal
          open={modalOpen}
          siteId={siteId}
          mode={modalMode}
          initialData={modalInitialData}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            await upcoming.refetch();
            await past.refetch();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}