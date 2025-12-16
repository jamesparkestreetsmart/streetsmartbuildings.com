"use client";

import { useState } from "react";
import { useStoreHoursExceptions } from "./useStoreHoursExceptions";
import ExceptionTable from "./ExceptionTable";
import StoreHoursChangeLog from "./StoreHoursChangeLog";
import ExceptionModal, {
  ExceptionModalMode,
} from "./ExceptionModal";

export default function StoreHoursManager({ siteId }: { siteId: string }) {
  // ============================
  // Exceptions data
  // ============================
  const { data, loading, error } =
    useStoreHoursExceptions(siteId);

  // ============================
  // Modal state
  // ============================
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] =
    useState<ExceptionModalMode>("create");
  const [modalInitialData, setModalInitialData] =
    useState<any | null>(null);

  // ============================
  // Loading / error
  // ============================
  if (loading) return <div>Loading exceptions…</div>;
  if (error)
    return (
      <div className="text-red-600">
        {error}
      </div>
    );
  if (!data) return null;

  // ============================
  // Handlers
  // ============================
  function handleAddException() {
    setModalMode("create");
    setModalInitialData(null);
    setModalOpen(true);
  }

  // ============================
  // Render
  // ============================
  return (
    <>
      {/* ============================
          EXISTING WEEKLY STORE HOURS
          (unchanged)
         ============================ */}
      {/* Your weekly store hours UI lives above */}

      {/* ============================
          EXCEPTIONS HEADER
         ============================ */}
      <div className="mt-10 mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Store Hours Exceptions
        </h2>

        <button
          onClick={handleAddException}
          className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
        >
          Add Exception
        </button>
      </div>

      {/* ============================
          THREE-COLUMN LAYOUT
         ============================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* THIS YEAR */}
        <ExceptionTable
          title={`This Year (${data.this_year.year})`}
          exceptions={data.this_year.exceptions}
        />

        {/* LAST YEAR (READ ONLY) */}
        <ExceptionTable
          title={`Last Year (${data.last_year.year})`}
          exceptions={data.last_year.exceptions}
          readOnly
        />

        {/* CHANGE LOG */}
        <StoreHoursChangeLog
          rows={data.change_log.rows}
        />
      </div>

      {/* ============================
          EXCEPTION MODAL
         ============================ */}
      <ExceptionModal
        open={modalOpen}
        mode={modalMode}
        siteId={siteId}
        initialData={modalInitialData}
        onClose={() => setModalOpen(false)}
        onSaved={() => setModalOpen(false)}
      />
    </>
  );
}
