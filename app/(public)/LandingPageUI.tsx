"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

type Persona = "facilities" | "cfo" | "residential";

export default function LandingPageUI() {
  const [leadEmail, setLeadEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [persona, setPersona] = useState<Persona>("facilities");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<File[]>([]);

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length + videos.length > 3) {
      setError("You may upload up to 3 videos total.");
      return;
    }
    setVideos((prev) => [...prev, ...files]);
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail,
          organization_name: orgName,
          source_page: "landing",
          persona,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to submit.");
        return;
      }

      setMessage("Thanks! We’ll reach out shortly.");
      setLeadEmail("");
      setOrgName("");
      setVideos([]);
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* LEFT */}
      <div className="flex-1 text-white px-10 py-8 flex flex-col justify-center bg-gradient-to-r from-green-700 to-yellow-500">
        <h1 className="text-4xl font-bold mb-1">Street Smart Buildings</h1>

        <p className="text-lg font-semibold mb-2">
          <span className="text-yellow-300 font-bold">
            Effective & Affordable
          </span>{" "}
          Building Intelligence
        </p>

        <p className="text-sm max-w-xl mb-3 leading-relaxed">
          We integrate best-in-class hardware, software, and industrial
          communication standards to reduce building operating costs.
        </p>

        {/* Persona Toggle */}
        <div className="flex gap-2 mb-3">
          {["facilities", "cfo", "residential"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPersona(p as Persona)}
              className={`px-3 py-1 rounded text-sm ${
                persona === p
                  ? "bg-white text-green-700 font-semibold"
                  : "bg-white/20"
              }`}
            >
              {p === "facilities"
                ? "Facilities"
                : p === "cfo"
                ? "CFO / Ops"
                : "Residential"}
            </button>
          ))}
        </div>

        {/* Persona Copy */}
        <p className="text-sm max-w-xl mb-4">
          {persona === "facilities" &&
            "Reduce emergency calls and truck rolls by catching equipment issues early."}
          {persona === "cfo" &&
            "Reduce operating expenses by cutting utility waste and extending asset life."}
          {persona === "residential" &&
            "Gain visibility into energy usage, comfort, and system health—without complexity."}
        </p>

        {/* Lead Form — ALWAYS VISIBLE */}
        <form
          onSubmit={handleLeadSubmit}
          className="bg-white/10 p-4 rounded-lg backdrop-blur-sm max-w-md mb-3"
        >
          <input
            type="text"
            placeholder="Organization / Property name"
            className="w-full p-2 rounded text-black mb-2"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />

          <input
            type="email"
            placeholder="you@company.com"
            className="w-full p-2 rounded text-black mb-2"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            required
          />

          <input
            type="file"
            accept="video/*"
            multiple
            onChange={handleVideoSelect}
            className="text-sm text-white mb-1"
          />

          <p className="text-xs text-white/80 mb-2">
            Optional: Upload a short walkthrough (≤2 min, up to 3 videos). Helps us deliver{" "}
            <span className="font-semibold text-yellow-300">
              Effective & Affordable
            </span>{" "}
            results.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-green-700 font-bold py-2 rounded"
          >
            {loading ? "Submitting…" : "Submit"}
          </button>

          {message && <p className="mt-2 text-emerald-200 text-sm">{message}</p>}
          {error && <p className="mt-2 text-red-300 text-sm">{error}</p>}
        </form>

        {/* Industries */}
        <p className="text-xs text-white/80 mb-2">
          <span className="font-semibold">Industries:</span>{" "}
          Residential • Commercial • Industrial
        </p>

        {/* What We Fight */}
        <p className="text-xs text-white/80 mb-1">
          <span className="font-semibold">We focus on:</span>{" "}
          Utility Reduction • Truck Roll Reduction • Asset Life Extension
        </p>

        {/* DIKW — compact */}
        <p className="text-xs text-white/80">
          <span className="font-semibold">Data → Information → Knowledge → Wisdom:</span>{" "}
          Turning raw signals into clear, cost-reducing actions.
        </p>
      </div>

      {/* RIGHT */}
      <div className="w-[40%] hidden md:flex items-center justify-center p-10 bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-10 w-full max-w-sm">
          <h2 className="text-2xl font-bold text-center mb-6">Login</h2>

          <LoginForm />

          <div className="text-center mt-4 text-sm">
            New here?{" "}
            <a href="/signup" className="text-green-700 font-semibold">
              Create an account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
