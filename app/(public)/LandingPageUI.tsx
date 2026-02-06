"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

type Persona = "facilities" | "cfo" | "residential";

export default function LandingPageUI() {
  const [leadEmail, setLeadEmail] = useState("");
  const [firstName, setFirstName] = useState("");
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
          first_name: firstName,
          source_page: "landing",
          persona,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to submit.");
        return;
      }

      setMessage("Thanks! We'll reach out shortly.");
      setLeadEmail("");
      setFirstName("");
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
      <div className="flex-1 text-white px-8 py-4 flex flex-col justify-between bg-gradient-to-r from-green-700 to-yellow-500">
        {/* Header */}
        <div className="mb-2">
          <p className="text-white/90 text-sm tracking-widest uppercase font-semibold">
            Eagle Eyes Building Solutions LLC
          </p>
          <p className="text-white/60 text-sm italic mb-1">— presents —</p>
          <h1 className="text-4xl font-bold mb-1">Street Smart Buildings</h1>
          <p className="text-lg font-semibold">
            <span className="text-yellow-300">most Reliable</span>
            {" & "}
            <span className="text-yellow-300">most Affordable</span>
            {" "}Building Intelligence
          </p>
        </div>

        {/* Vision & Mission - Stacked */}
        <div className="space-y-2 mb-2">
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h3 className="font-bold text-lg mb-1">Vision</h3>
            <p className="text-base leading-relaxed italic text-white/90">
              We envision a world where every building is continuously connected to its digital 
              counterpart—providing real-time operational visibility, predictive intelligence, and 
              autonomous optimization as a standard layer of modern infrastructure.
            </p>
          </div>
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h3 className="font-bold text-lg mb-1">Mission</h3>
            <p className="text-base leading-relaxed text-white/90">
              Deliver the <span className="text-yellow-300 font-semibold">most Reliable</span> & <span className="text-yellow-300 font-semibold">most Affordable</span> smart 
              building solutions as a systems integrator—selecting best-in-class hardware, software, and communication standards.
            </p>
            <p className="text-sm text-white/80 mt-2">
              <span className="font-semibold">We attack:</span> Utility Costs • Truck Rolls • Asset Degradation
            </p>
          </div>
        </div>

        {/* Persona Toggle + Copy */}
        <div className="mb-2">
          <div className="flex gap-2 mb-1">
            {["facilities", "cfo", "residential"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPersona(p as Persona)}
                className={`px-4 py-1.5 rounded text-sm ${
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
          <p className="text-sm leading-relaxed">
            {persona === "facilities" &&
              "We help facilities teams reduce emergency calls and unnecessary truck rolls by detecting abnormal equipment behavior early, before issues turn into downtime or reactive maintenance."}
            {persona === "cfo" &&
              "We help operators and finance leaders reduce operating expenses by identifying utility waste, inefficient operation, and early signs of asset degradation across their building portfolio."}
            {persona === "residential" &&
              "We provide homeowners and property managers with visibility into energy usage, comfort, and system health across primary residences, rental homes, and vacation properties."}
          </p>
        </div>

        {/* DIKW - 2x2 Grid */}
        <div className="mb-2">
          <h3 className="font-semibold text-base mb-1">How We Turn Data Into Action</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white/10 rounded p-2">
              <span className="font-semibold text-yellow-300">Data</span>
              <p className="text-white/80 text-xs">Temperature • Humidity • Pressure • Flow • Energy</p>
            </div>
            <div className="bg-white/10 rounded p-2">
              <span className="font-semibold text-yellow-300">Information</span>
              <p className="text-white/80 text-xs">Contextualized against schedules & setpoints</p>
            </div>
            <div className="bg-white/10 rounded p-2">
              <span className="font-semibold text-yellow-300">Knowledge</span>
              <p className="text-white/80 text-xs">Waste, degradation, abnormal behavior detected</p>
            </div>
            <div className="bg-white/10 rounded p-2">
              <span className="font-semibold text-yellow-300">Wisdom</span>
              <p className="text-white/80 text-xs">Clear actions that reduce cost & extend asset life</p>
            </div>
          </div>
        </div>

        {/* Lead Form */}
        <form
          onSubmit={handleLeadSubmit}
          className="bg-white/10 p-3 rounded-lg backdrop-blur-sm"
        >
          <h3 className="font-semibold text-base mb-2">Get Started</h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="First name"
              className="flex-1 p-2 rounded text-black text-sm"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="you@company.com"
              className="flex-1 p-2 rounded text-black text-sm"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <input
              type="file"
              accept="video/*"
              multiple
              onChange={handleVideoSelect}
              className="text-xs text-white"
            />
          </div>
          <p className="text-xs text-white/70 mb-2">
            Optional: Upload a short building walkthrough (≤2 minutes each, up to 3 videos). 
            This helps us deliver{" "}
            <span className="font-semibold text-yellow-300">Reliable & Affordable</span> results.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-green-700 font-bold py-2 rounded text-sm"
          >
            {loading ? "Submitting…" : "Submit"}
          </button>
          {message && <p className="mt-2 text-emerald-200 text-sm">{message}</p>}
          {error && <p className="mt-2 text-red-300 text-sm">{error}</p>}
        </form>
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
