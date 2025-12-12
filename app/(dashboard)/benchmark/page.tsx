"use client";

export default function BenchmarkPage() {
  return (
    <div className="p-6 text-center mt-12">
      {/* Gradient Header */}
      <h1
        className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-2 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)]"
      >
        Organizational Level Benchmarking
      </h1>

      {/* Description */}
      <p className="text-gray-600 text-sm max-w-2xl mx-auto">
        A future dashboard highlighting{" "}
        <span className="font-semibold text-gray-800">energy usage, efficiency scores, operating costs, and uptime</span>{" "}
        across all monitored equipment — giving you a standardized way to measure performance across locations.
      </p>

      {/* Subtext */}
      <div className="mt-8 text-gray-400 italic">
        (Coming soon — comparisons, rankings, lifecycle analysis, and optimization recommendations.)
      </div>
    </div>
  );
}
