"use client";

export default function JourneyPage() {
  return (
    <div className="p-6 text-center mt-12">
      {/* Gradient Header with subtle glow */}
      <h1
        className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-2 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)]"
      >
        My Journey
      </h1>

      {/* Description */}
      <p className="text-gray-600 text-sm max-w-2xl mx-auto">
        To be filled out on an annual basis as Eagle Eyes reviews{" "}
        <span className="font-semibold text-gray-800">
          customer savings, efficiency gains, and productivity data
        </span>{" "}
        — tracking your building’s evolution toward smarter, leaner operations.
      </p>

      {/* Subtext */}
      <div className="mt-8 text-gray-400 italic">
        (Coming soon — annual insights, progress dashboards, and sustainability benchmarks.)
      </div>
    </div>
  );
}
