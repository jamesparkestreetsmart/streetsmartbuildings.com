"use client";

import Link from "next/link";

export default function BenchmarkPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto mt-12">
      {/* Gradient Header */}
      <h1
        className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-2 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)] text-center"
      >
        Organizational Level Benchmarking
      </h1>

      {/* Description */}
      <p className="text-gray-600 text-sm max-w-2xl mx-auto text-center">
        Cross-site diagnostics and performance comparisons across all monitored equipment.
      </p>

      {/* Navigation Cards */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/benchmark/anomalies"
          className="block rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow border border-gray-100 p-6 group"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-4 h-4 rounded-sm" style={{ backgroundColor: "#b45309" }} />
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-amber-700 transition-colors">
              Anomaly Events
            </h2>
          </div>
          <p className="text-sm text-gray-500">
            View all anomaly events across all sites — coil freezes, short cycling, efficiency drops, and more.
          </p>
          <span className="mt-4 inline-block text-xs text-amber-600 font-medium">View Org-Wide &rarr;</span>
        </Link>

        <Link
          href="/benchmark/compressor-cycles"
          className="block rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow border border-gray-100 p-6 group"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-4 h-4 rounded-sm" style={{ backgroundColor: "#3730a3" }} />
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
              Compressor Cycles
            </h2>
          </div>
          <p className="text-sm text-gray-500">
            Track compressor on/off cycles across all sites — duration, energy, efficiency, and temperature deltas.
          </p>
          <span className="mt-4 inline-block text-xs text-indigo-600 font-medium">View Org-Wide &rarr;</span>
        </Link>
      </div>

      {/* Future */}
      <div className="mt-10 text-center text-gray-400 italic text-sm">
        Coming soon — energy comparisons, rankings, lifecycle analysis, and optimization recommendations.
      </div>
    </div>
  );
}
