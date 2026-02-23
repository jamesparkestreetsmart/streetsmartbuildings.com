"use client";

import { useState } from "react";
import { useOrg } from "@/context/OrgContext";
import WeeklyStoreHours from "./WeeklyStoreHours";
import UpcomingEventsTable from "./UpcomingEventsTable";
import { PastEventsTable } from "./PastEventsTable";

import AddEventModal, { AddEventModalMode } from "./AddEventModal";
import { useFutureExceptions, FutureException } from "./useFutureExceptions";
import { usePastStoreHours } from "./usePastStoreHours";
import { useStoreHoursChangeLog } from "./useStoreHoursChangeLog";
import StoreHoursChangeLog from "./StoreHoursChangeLog";
import { useStoreHoursComments } from "./useStoreHoursComments";
import CommentModal from "./CommentModal";

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
  const { userEmail } = useOrg();
  const upcoming = useFutureExceptions(siteId);
  const past = usePastStoreHours(siteId);
  const changelog = useStoreHoursChangeLog(siteId);
  const comments = useStoreHoursComments(siteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentModalDate, setCommentModalDate] = useState("");
  const [commentModalDateLabel, setCommentModalDateLabel] = useState("");
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
    if (!confirm(`Delete this event and all future occurrences from "${e.event_name}" starting ${e.event_date}?`)) return;

    const res = await fetch(`/api/store-hours/rules/${e.rule_id}?from_date=${e.event_date}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ created_by: userEmail || "system" }),
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
    await changelog.refetch();
  }

  function openCommentModal(date: string, dateLabel: string) {
    setCommentModalDate(date);
    setCommentModalDateLabel(dateLabel);
    setCommentModalOpen(true);
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
          <PastEventsTable
            rows={past.rows}
            commentsByDate={comments.commentsByDate}
            onCommentClick={(date, label) => openCommentModal(date, label)}
          />

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
              commentsByDate={comments.commentsByDate}
              onCommentClick={(date, label) => openCommentModal(date, label)}
            />
          </div>

          {/* RIGHT — Change Log */}
          <StoreHoursChangeLog
            entries={changelog.entries}
            loading={changelog.loading}
            error={changelog.error}
          />
        </div>
      </div>

      {modalOpen && (
        <AddEventModal
          open={modalOpen}
          siteId={siteId}
          timezone={timezone}
          mode={modalMode}
          initialData={modalInitialData}
          userEmail={userEmail}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            await upcoming.refetch();
            await past.refetch();
            await changelog.refetch();
            setModalOpen(false);
          }}
        />
      )}

      <CommentModal
        open={commentModalOpen}
        date={commentModalDate}
        dateLabel={commentModalDateLabel}
        comments={comments.commentsByDate.get(commentModalDate) || []}
        onClose={() => setCommentModalOpen(false)}
        onAdd={async (message) => {
          await comments.addComment(commentModalDate, message, userEmail || "system");
          await changelog.refetch();
        }}
      />
    </>
  );
}
