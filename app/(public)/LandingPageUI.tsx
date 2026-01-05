"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

type Persona = "facilities" | "cfo";

export default function LandingPageUI() {
  const [leadEmail, setLeadEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [persona, setPersona] = useState<Persona>("facilities");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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
      <div className="flex-1 text-white px-12 py-10 flex flex-col justify-center bg-gradient-to-r from-green-700 to-yellow-500">
        <h1 className="text-4xl font-bold mb-2">Street Smart Buildings</h1>
        <p className="text-lg font-semibold mb-4">
          Effective & Affordable Building Intelligence
        </p>

        {/* Persona Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setPersona("facilities")}
            className={`px-3 py-1 rounded text-sm ${
              persona === "facilities"
                ? "bg-white text-green-700 font-semibold"
                : "bg-white/20"
            }`}
          >
            Facilities Manager
          </button>
          <button
            type="button"
            onClick={() => setPersona("cfo")}
            className={`px-3 py-1 rounded text-sm ${
              persona === "cfo"
                ? "bg-white text-green-700 font-semibold"
                : "bg-white/20"
            }`}
          >
            CFO / Operations
          </button>
        </div>

        {/* Persona Copy */}
        {persona === "facilities" ? (
          <p className="text-sm max-w-xl mb-5 leading-relaxed">
            We help facilities teams reduce emergency calls, detect equipment
            issues early, and minimize truck rolls by continuously monitoring
            temperature, pressure, flow, energy usage, and equipment behavior.
          </p>
        ) : (
          <p className="text-sm max-w-xl mb-5 leading-relaxed">
            We help operators and finance leaders reduce operating expenses by
            cutting utility waste, extending asset life, and preventing
            avoidable maintenance costs across their building portfolio.
          </p>
        )}

        <div className="max-w-xl mb-6">
          <h3 className="font-semibold mb-2">What We Fight Every Day</h3>
          <ul className="text-sm space-y-1">
            <li>
              <span className="font-semibold">Utility Reduction</span>
              <div className="ml-4 text-white/80">
                Electric • Gas • Water • Sewer • Thermal • Power Quality
              </div>
            </li>
            <li className="font-semibold">Truck Roll Reduction</li>
            <li className="font-semibold">Asset Life Extension</li>
          </ul>
        </div>

        <div className="max-w-xl mb-6">
          <h3 className="font-semibold mb-2">What We Monitor</h3>
          <ul className="list-disc ml-5 text-sm space-y-1">
            <li>Temperature & humidity</li>
            <li>Pressure & flow rate</li>
            <li>Electrical usage & power quality</li>
            <li>Gas, water, and thermal utilities</li>
            <li>Critical equipment runtime & asset health</li>
          </ul>
        </div>

        {/* Lead Form */}
        <form
          onSubmit={handleLeadSubmit}
          className="bg-white/10 p-5 rounded-lg backdrop-blur-sm max-w-md"
        >
          <input
            type="text"
            placeholder="Organization name"
            className="w-full p-2 rounded text-black mb-2"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />

          <input
            type="email"
            placeholder="you@company.com"
            className="w-full p-2 rounded text-black mb-3"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            required
          />

          <input
            type="file"
            accept="video/*"
            multiple
            onChange={handleVideoSelect}
            className="text-sm text-white mb-2"
          />

          <p className="text-xs text-white/80 mb-3">
            Upload a short building walkthrough (≤2 minutes each, up to 3 videos).
            This helps us deliver on our mantra: <em>Effective & Affordable</em>.
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
      </div>

      {/* RIGHT */}
      <div className="w-[40%] hidden md:flex items-center justify-center p-12 bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-10 w-full max-w-sm">
          <h2 className="text-2xl font-bold text-center mb-6">Login</h2>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
