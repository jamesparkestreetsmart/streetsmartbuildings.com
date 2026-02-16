"use client";

import { useState } from "react";
import WeeklyStoreHours from "./WeeklyStoreHours";
import UpcomingEventsTable from "./UpcomingEventsTable";
import { PastEventsTable } from "./PastEventsTable";

import AddEventModal, { AddEventModalMode } from "./AddEventModal";
import { useFutureExceptions, FutureException } from "./useFutureExceptions";
import { usePastStoreHours } from "./usePastStoreHours";

function todayInTimezone(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function EventsDisclaimer() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm rounded p-3">
      Events are generated from schedules. Editing or deleting an event affects
      the schedule and all future occurrences. Past events are shown for reference.
    </div>
  );
}

export default function StoreHoursManager({ siteId, timezone }: { siteId: string; timezone: string }) {
  const upcoming = useFutureExceptions(siteId);
  const past = usePastStoreHours(siteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AddEventModalMode>("create");
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  if (upcoming.loading || past.loading) return <div>Loading store hours…</div>;
  if (upcoming.error) return <div className="text-red-600">{upcoming.error}</div>;
  if (past.error) return <div className="text-red-600">{past.error}</div>;

  async function triggerManifestPushIfToday(eventDate: string) {
    const siteToday = todayInTimezone(timezone);
    if (eventDate !== siteToday) return;

    try {
      await fetch("/api/manifest/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, date: eventDate }),
      });
    } catch (err) {
      console.error("Manifest push failed:", err);
    }
  }

  async function handleDelete(e: FutureException) {
    if (!confirm("Delete this schedule and all future events?")) return;

    const res = await fetch(`/api/store-hours/rules/${e.rule_id}`, {
      method: "DELETE",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete schedule");
      return;
    }

    // If deleting today's event, push updated manifest
    await triggerManifestPushIfToday(e.event_date);

    await upcoming.refetch();
    await past.refetch();
  }

  function handleEdit(e: FutureException) {
    setModalMode("edit-one-time");
    setModalInitialData(e); // Pass full event data for hydration
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
          timezone={timezone}
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
