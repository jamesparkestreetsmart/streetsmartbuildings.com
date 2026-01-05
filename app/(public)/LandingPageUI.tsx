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
          <span className="text-yellow-300 font-bold">
            Effective & Affordable
          </span>{" "}
          Building Intelligence
        </p>

        <p className="text-sm max-w-xl mb-5 leading-relaxed">
          We are a <span className="font-semibold">systems integrator</span>—
          strategically selecting best-in-class hardware, software, and
          industrial communication standards to deliver effective, affordable
          solutions that reduce building operating costs.
        </p>

        {/* Persona Toggle */}
        <div className="flex gap-2 mb-5">
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
            We help facilities teams reduce emergency calls, detect issues early,
            and minimize truck rolls by continuously monitoring building systems.
          </p>
        ) : (
          <p className="text-sm max-w-xl mb-5 leading-relaxed">
            We help operators and finance leaders reduce operating expenses by
            cutting utility waste, extending asset life, and preventing
            avoidable maintenance costs.
          </p>
        )}

        {/* What We Fight */}
        <div className="max-w-xl mb-6">
          <h3 className="font-semibold mb-2">What We Fight Every Day</h3>
          <ul className="text-sm space-y-1">
            <li>
              <span className="font-semibold">Utility Reduction</span>
              <div className="ml-4 text-white/80">
                Electric • Gas • Water
              </div>
            </li>
            <li className="font-semibold">Truck Roll Reduction</li>
            <li className="font-semibold">Asset Life Extension</li>
          </ul>
        </div>

        {/* DIKW */}
        <div className="max-w-xl mb-6">
          <h3 className="font-semibold mb-3">How We Turn Data Into Action</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-semibold">Data</span>
              <div className="ml-4 text-white/80">
                Temperature • Pressure • Flow • Energy • Runtime
              </div>
            </li>
            <li>
              <span className="font-semibold">Information</span>
              <div className="ml-4 text-white/80">
                Contextualized against schedules and normal operation
              </div>
            </li>
            <li>
              <span className="font-semibold">Knowledge</span>
              <div className="ml-4 text-white/80">
                Waste, degradation, abnormal behavior, early failure signals
              </div>
            </li>
            <li>
              <span className="font-semibold">Wisdom</span>
              <div className="ml-4 text-white/80">
                Clear actions that reduce cost and extend asset life
              </div>
            </li>
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
            This helps us deliver on our mantra:{" "}
            <span className="font-semibold text-yellow-300">
              Effective & Affordable
            </span>
            .
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
