"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

interface Asset {
  id: string;
  storage_path: string;
  asset_type: string;
  notes: string | null;
  created_at: string;
  downloadUrl: string | null;
}

interface CommissioningSectionProps {
  deviceId: string;
  commissionedAt: string | null;
}

export default function CommissioningSection({
  deviceId,
  commissionedAt,
}: CommissioningSectionProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAssets = async () => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/commissioning/assets`);
      const data = await res.json();
      setAssets(data.assets || []);
    } catch {
      // Retry on next load
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAssets();
  }, [deviceId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);

    try {
      // 1. Get signed upload URL
      const urlRes = await fetch(`/api/devices/${deviceId}/commissioning/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          fileSizeBytes: file.size,
          filename: file.name,
        }),
      });

      if (!urlRes.ok) {
        const data = await urlRes.json();
        setUploadError(data.error || "Failed to get upload URL");
        setUploading(false);
        return;
      }

      const { uploadUrl, storagePath } = await urlRes.json();

      // 2. Upload to signed URL
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        setUploadError("Upload failed");
        setUploading(false);
        return;
      }

      // 3. Record metadata
      await fetch(`/api/devices/${deviceId}/commissioning/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          notes: notes.trim() || null,
        }),
      });

      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      await loadAssets();
    } catch {
      setUploadError("Network error during upload");
    }

    setUploading(false);
  };

  const handleDelete = async (assetId: string) => {
    try {
      await fetch(`/api/devices/${deviceId}/commissioning/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    } catch {
      // Best effort
    }
  };

  return (
    <div className="bg-white border rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Commissioning Evidence</h2>
        {commissionedAt && (
          <span className="text-xs text-gray-500">
            Commissioned {new Date(commissionedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Upload */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-3">
          <label className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
            {uploading ? "Uploading..." : "Add Photo"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
          <input
            type="text"
            placeholder="Notes (optional)"
            className="flex-1 border rounded-md p-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {uploadError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {uploadError}
          </div>
        )}
      </div>

      {/* Gallery */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading photos...</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-gray-400">No photos yet</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {assets.map((asset) => (
            <div key={asset.id} className="relative group">
              {asset.downloadUrl ? (
                <img
                  src={asset.downloadUrl}
                  alt={asset.notes || "Commissioning photo"}
                  className="w-full h-32 object-cover rounded-lg cursor-pointer border"
                  onClick={() => setViewUrl(asset.downloadUrl)}
                />
              ) : (
                <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-400">
                  No preview
                </div>
              )}

              <button
                onClick={() => handleDelete(asset.id)}
                className="absolute top-1 right-1 p-1 bg-white/80 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <div className="mt-1">
                <p className="text-[10px] text-gray-400">
                  {new Date(asset.created_at).toLocaleDateString()}
                </p>
                {asset.notes && (
                  <p className="text-xs text-gray-600 truncate">{asset.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full image modal */}
      {viewUrl && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setViewUrl(null)}
        >
          <img
            src={viewUrl}
            alt="Full size"
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-xl"
          />
        </div>
      )}
    </div>
  );
}
