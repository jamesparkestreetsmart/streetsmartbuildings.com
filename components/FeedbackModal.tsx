"use client";

import { useState } from "react";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string | null;
  orgName: string | null;
}

export default function FeedbackModal({
  open,
  onClose,
  orgId,
  orgName,
}: FeedbackModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  function handleClose() {
    setSubject("");
    setBody("");
    setError(null);
    setSuccess(false);
    onClose();
  }

  async function handleSubmit() {
    if (!subject.trim() || !body.trim() || sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          org_id: orgId,
          org_name: orgName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send feedback");
      }

      setSuccess(true);
      setSubject("");
      setBody("");
    } catch (e: any) {
      setError(e.message || "Failed to send feedback. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-5 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Send Feedback
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &#10005;
          </button>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <div className="text-green-600 font-medium mb-2">
              Thank you for your feedback!
            </div>
            <p className="text-sm text-gray-500 mb-4">
              We appreciate you taking the time to share your thoughts.
            </p>
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Error */}
            {error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            {/* Subject */}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your feedback"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 mb-3"
              autoFocus
            />

            {/* Body */}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Details
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your suggestion, issue, or idea..."
              rows={5}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 mb-4 resize-none"
            />

            {/* Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || !subject.trim() || !body.trim()}
                className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
