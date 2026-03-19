"use client";

import { useState, useRef, useCallback } from "react";
import supabase from "@/lib/supabaseClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Attachment {
  path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

type RecordType = "work_items" | "platform_issues" | "learnings" | "org_issues";

// Map RecordType to the actual Postgres table name
const TABLE_MAP: Record<RecordType, string> = {
  work_items: "c_work_items",
  platform_issues: "c_platform_issues",
  learnings: "c_learnings",
  org_issues: "c_org_issues",
};

interface AttachmentsPanelProps {
  recordType: RecordType;
  recordId: string;
  idColumn: string; // work_item_id | issue_id | learning_id
  storagePathPrefix: string; // e.g. "work-items/{id}" — already interpolated
  attachments: Attachment[];
  onAttachmentsChange: (updated: Attachment[]) => void;
}

const BUCKET = "work-item-attachments";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "application/pdf"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function generateStorageFilename(originalName: string): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); // 20260320T055501Z
  return `${ts}-${sanitizeFilename(originalName)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AttachmentsPanel({
  recordType,
  recordId,
  idColumn,
  storagePathPrefix,
  attachments,
  onAttachmentsChange,
}: AttachmentsPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null); // path being deleted
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // path pending confirm
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort newest first
  const sorted = [...attachments].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);

      // Client-side validation
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("Only images and PDFs are allowed.");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError("File must be under 10 MB.");
        return;
      }

      setUploading(true);
      setUploadProgress("Uploading...");

      const generatedName = generateStorageFilename(file.name);
      const storagePath = `${storagePathPrefix}/${generatedName}`;

      try {
        // 1. Upload to storage
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });

        if (uploadErr) throw new Error(uploadErr.message);

        setUploadProgress("Saving record...");

        // 2. Build attachment object
        const attachmentObj: Attachment = {
          path: storagePath,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_at: new Date().toISOString(),
        };

        // 3. Call append_attachment RPC
        const { error: rpcErr } = await supabase.rpc("append_attachment", {
          p_table: TABLE_MAP[recordType],
          p_id_col: idColumn,
          p_id: recordId,
          p_attachment: attachmentObj,
        });

        if (rpcErr) {
          // Rollback: delete the uploaded file
          await supabase.storage.from(BUCKET).remove([storagePath]);
          throw new Error(rpcErr.message);
        }

        // 4. Update local state
        onAttachmentsChange([...attachments, attachmentObj]);
        setUploadProgress(null);
      } catch (err: any) {
        setError(err.message || "Upload failed");
        setUploadProgress(null);
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [recordType, recordId, idColumn, storagePathPrefix, attachments, onAttachmentsChange]
  );

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(
    async (path: string) => {
      setError(null);
      setDeleting(path);
      setConfirmDelete(null);

      try {
        // 1. Delete from storage
        const { error: storageErr } = await supabase.storage.from(BUCKET).remove([path]);
        if (storageErr) throw new Error("Failed to delete file: " + storageErr.message);

        // 2. Call remove_attachment RPC
        const { error: rpcErr } = await supabase.rpc("remove_attachment", {
          p_table: TABLE_MAP[recordType],
          p_id_col: idColumn,
          p_id: recordId,
          p_path: path,
        });

        if (rpcErr) {
          // Storage already deleted but DB failed — warn but still update UI
          console.error("[AttachmentsPanel] DB remove failed after storage delete:", rpcErr.message);
        }

        // 3. Update local state
        onAttachmentsChange(attachments.filter((a) => a.path !== path));
      } catch (err: any) {
        setError(err.message || "Delete failed");
      } finally {
        setDeleting(null);
      }
    },
    [recordType, recordId, idColumn, attachments, onAttachmentsChange]
  );

  // -------------------------------------------------------------------------
  // Preview (signed URL)
  // -------------------------------------------------------------------------

  const handlePreview = useCallback(async (att: Attachment) => {
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(att.path, 300); // 5 min expiry

    if (signErr || !data?.signedUrl) {
      setError("Could not generate preview URL");
      return;
    }

    if (att.mime_type === "application/pdf") {
      window.open(data.signedUrl, "_blank", "noopener");
    } else {
      setPreviewUrl(data.signedUrl);
      setPreviewFilename(att.filename);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Attachments</label>
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
            uploading
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
          }`}
        >
          <UploadIcon />
          {uploadProgress ?? "Upload"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
        </label>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-gray-400">No attachments yet.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((att) => {
            const isImage = att.mime_type.startsWith("image/");
            const isDeleting = deleting === att.path;

            return (
              <div
                key={att.path}
                className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded border text-sm group"
              >
                {/* Icon */}
                <span className="flex-shrink-0 text-gray-400">
                  {isImage ? <ImageIcon /> : <FileIcon />}
                </span>

                {/* Info */}
                <button
                  type="button"
                  onClick={() => handlePreview(att)}
                  className="flex-1 min-w-0 text-left hover:text-blue-600"
                  title="Preview"
                >
                  <span className="block truncate text-sm font-medium text-gray-700 group-hover:text-blue-600">
                    {att.filename}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatBytes(att.size_bytes)} &middot; {timeAgo(att.uploaded_at)}
                  </span>
                </button>

                {/* Delete */}
                {confirmDelete === att.path ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDelete(att.path)}
                      disabled={isDeleting}
                      className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? "..." : "Yes"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(att.path)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={() => { setPreviewUrl(null); setPreviewFilename(null); }}
        >
          <div
            className="relative max-w-4xl max-h-[85vh] bg-white rounded-lg shadow-xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <span className="text-sm font-medium text-gray-700 truncate">{previewFilename}</span>
              <button
                onClick={() => { setPreviewUrl(null); setPreviewFilename(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3"
              >
                &times;
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={previewFilename ?? "Preview"}
              className="max-w-full max-h-[75vh] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
