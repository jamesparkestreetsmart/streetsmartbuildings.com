"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Download, Lock } from "lucide-react";

interface Document {
  doc_id: string;
  title: string;
  description: string | null;
  category: string;
  storage_bucket: string;
  storage_path: string;
  file_type: string;
  version: string | null;
  prepared_by: string | null;
  confidential: boolean;
  created_at: string;
}

const CATEGORIES = [
  { key: "", label: "All" },
  { key: "cpa", label: "CPA / Tax" },
  { key: "legal", label: "Legal" },
  { key: "financial", label: "Financial" },
  { key: "hr", label: "HR" },
  { key: "operational", label: "Operational" },
];

const CATEGORY_STYLES: Record<string, string> = {
  cpa: "bg-[#1e293b] text-white",
  legal: "bg-[#1e40af] text-white",
  financial: "bg-[#0d9488] text-white",
  hr: "bg-[#7c3aed] text-white",
  operational: "bg-[#6b7280] text-white",
};

export default function DocumentsTab() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("c_business_documents")
        .select("*")
        .order("category")
        .order("title");
      if (err) {
        console.error("Failed to load documents:", err);
      }
      setDocuments(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (!categoryFilter) return documents;
    return documents.filter((d) => d.category === categoryFilter);
  }, [documents, categoryFilter]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Document[]>();
    for (const doc of filtered) {
      const list = map.get(doc.category) || [];
      list.push(doc);
      map.set(doc.category, list);
    }
    return map;
  }, [filtered]);

  const handleDownload = async (doc: Document) => {
    setDownloadingId(doc.doc_id);
    setError(null);
    try {
      const { data, error: urlErr } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60);

      if (urlErr || !data?.signedUrl) {
        setError("Could not generate download link");
        return;
      }

      // Trigger download via hidden anchor
      const a = window.document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } catch {
      setError("Could not generate download link");
    } finally {
      setDownloadingId(null);
    }
  };

  function getCategoryLabel(key: string): string {
    return CATEGORIES.find((c) => c.key === key)?.label || key;
  }

  if (loading) {
    return <div className="border rounded-lg bg-white p-8 text-center text-sm text-gray-400">Loading documents...</div>;
  }

  if (documents.length === 0) {
    return (
      <div className="border rounded-lg bg-white p-12 text-center">
        <p className="text-sm text-gray-400">No documents have been uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error toast */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-4">&times;</button>
        </div>
      )}

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cat.key
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Document cards grouped by category */}
      {filtered.length === 0 ? (
        <div className="border rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-gray-400">No documents in this category yet.</p>
        </div>
      ) : (
        [...grouped.entries()].map(([category, docs]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {getCategoryLabel(category)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {docs.map((doc) => (
                <div key={doc.doc_id} className="relative border rounded-xl bg-white p-5 hover:shadow-sm transition-shadow">
                  {/* Confidential badge */}
                  {doc.confidential && (
                    <div className="absolute top-3 right-3" title="Confidential">
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                  )}

                  {/* Category badge */}
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-medium mb-3 ${CATEGORY_STYLES[doc.category] || CATEGORY_STYLES.operational}`}>
                    {getCategoryLabel(doc.category)}
                  </span>

                  {/* Title */}
                  <h4 className="text-base font-semibold text-gray-900 mb-1 pr-6">{doc.title}</h4>

                  {/* Description */}
                  {doc.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-3">{doc.description}</p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-4">
                    {doc.version && <span>Version: {doc.version}</span>}
                    {doc.prepared_by && <span>Prepared by: {doc.prepared_by}</span>}
                    <span>{doc.file_type.toUpperCase()}</span>
                  </div>

                  {/* Download button */}
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.doc_id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1e293b] text-white hover:bg-[#334155] disabled:opacity-50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingId === doc.doc_id ? "Preparing..." : `Download ${doc.file_type.toUpperCase()}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
