"use client";

import { useState } from "react";
import { StoreHoursComment } from "./useStoreHoursComments";

interface CommentModalProps {
  open: boolean;
  date: string;
  dateLabel: string;
  comments: StoreHoursComment[];
  onClose: () => void;
  onAdd: (message: string) => Promise<void>;
}

export default function CommentModal({
  open,
  date,
  dateLabel,
  comments,
  onClose,
  onAdd,
}: CommentModalProps) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(text.trim());
      setText("");
    } catch (e: any) {
      setError(e.message || "Failed to add comment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-5 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comments</h2>
            <p className="text-sm text-gray-500">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Existing Comments */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-[80px]">
          {comments.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">
              No comments yet for this date.
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-700">{c.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {c.created_by && c.created_by !== "system" && (
                      <span className="text-xs text-gray-400">
                        — {c.created_by}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Add Comment */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={saving || !text.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
