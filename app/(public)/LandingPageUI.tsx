"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

type Industry = "qsr" | "hospitality" | "office" | "residential";

const INDUSTRY_LABELS: Record<Industry, string> = {
  qsr: "QSR / Fast Casual",
  hospitality: "Hospitality",
  office: "Office / Commercial",
  residential: "Residential",
};

const INDUSTRY_PITCH: Record<Industry, { headline: string; body: string; highlights: string[] }> = {
  qsr: {
    headline: "Smarter Restaurants, Lower Operating Costs",
    body: "We help QSR and fast casual operators reduce utility spend, eliminate unnecessary truck rolls, and extend equipment life — across HVAC, walk-ins, fryers, and more.",
    highlights: [
      "Automated HVAC optimization with Smart Start scheduling and humidity-aware control to reduce energy usage",
      "Early-warning HVAC diagnostics that identify developing failures before emergency service calls",
      "Refrigeration & freezer monitoring with real-time alerts to prevent product loss",
      "Water usage monitoring that detects leaks, stuck valves, and overnight waste",
      "Portfolio benchmarking across locations to identify underperforming stores and hidden savings opportunities",
    ],
  },
  hospitality: {
    headline: "Guest Comfort Meets Operational Efficiency",
    body: "We help hotel operators balance guest experience with energy savings through occupancy-aware automation, predictive maintenance, and real-time asset visibility across your portfolio.",
    highlights: [
      "Occupancy-based HVAC scheduling — heat & cool only when needed",
      "Check-in / check-out aware automation for room turnover",
      "Water heater & boiler monitoring for guest comfort assurance",
      "Portfolio-wide dashboards for multi-property operators",
    ],
  },
  office: {
    headline: "Reduce Overhead, Improve Tenant Comfort",
    body: "We help commercial property managers and office operators cut operating expenses while maintaining optimal tenant comfort through intelligent building automation.",
    highlights: [
      "Scheduled HVAC control aligned to lease hours & occupancy",
      "Tenant comfort monitoring with automated adjustments",
      "Common area & parking energy optimization",
      "Predictive maintenance to avoid costly emergency repairs",
    ],
  },
  residential: {
    headline: "Visibility & Control for Every Home",
    body: "We give homeowners and property managers real-time insight into energy usage, system health, and comfort — whether it's your primary residence, a rental, or a vacation property.",
    highlights: [
      "Whole-home energy monitoring & utility bill analysis",
      "HVAC health tracking with early fault detection",
      "Water leak detection & consumption alerts",
      "Remote visibility for vacation homes & rental properties",
    ],
  },
};

export default function LandingPageUI() {
  const [leadEmail, setLeadEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [industry, setIndustry] = useState<Industry>("qsr");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<File[]>([]);

  const pitch = INDUSTRY_PITCH[industry];

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length + videos.length > 3) {
      setError("You may upload up to 3 videos total.");
      return;
    }
    setVideos((prev) => [...prev, ...files]);
  }

  async function uploadVideos(email: string, leadId: string) {
    for (const video of videos) {
      try {
        // Get duration
        const duration = await getVideoDuration(video);

        // Get signed upload URL
        const res = await fetch("/api/leads/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            lead_id: leadId,
            filename: video.name,
            contentType: video.type,
            fileSizeBytes: video.size,
            durationSeconds: Math.round(duration),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          console.error("Upload URL error:", data.error);
          continue;
        }

        // Upload the file
        await fetch(data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": video.type },
          body: video,
        });
      } catch (err) {
        console.error("Video upload failed:", err);
      }
    }

    // Confirm uploads
    if (videos.length > 0) {
      await fetch("/api/leads/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    }
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create the lead
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail,
          first_name: firstName,
          source_page: "landing",
          industry,
          utm_source: params.get("utm_source") || null,
          utm_medium: params.get("utm_medium") || null,
          utm_campaign: params.get("utm_campaign") || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to submit.");
        return;
      }

      // Step 2: Upload videos with lead_id
      if (videos.length > 0 && data.lead_id) {
        await uploadVideos(leadEmail, data.lead_id);
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
              Deliver the <span className="text-yellow-300 font-semibold">most Reliable</span> &{" "}
              <span className="text-yellow-300 font-semibold">most Affordable</span> smart
              building solutions as a systems integrator—selecting best-in-class hardware, software,
              and communication standards.
            </p>
            <p className="text-sm text-white/80 mt-2">
              <span className="font-semibold">We attack:</span> Utility Costs • Truck Rolls • Asset
              Degradation
            </p>
          </div>
        </div>

        {/* Industry Toggle */}
        <div className="mb-2">
          <h3 className="font-semibold text-base mb-1.5">Select Your Industry</h3>
          <div className="flex gap-2 mb-2">
            {(Object.keys(INDUSTRY_LABELS) as Industry[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setIndustry(key)}
                className={`px-4 py-1.5 rounded text-sm transition-colors ${
                  industry === key
                    ? "bg-white text-green-700 font-semibold"
                    : "bg-white/20 hover:bg-white/30"
                }`}
              >
                {INDUSTRY_LABELS[key]}
              </button>
            ))}
          </div>

          {/* Industry-specific pitch */}
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="font-bold text-base mb-1 text-yellow-300">{pitch.headline}</h4>
            <p className="text-sm leading-relaxed mb-2">{pitch.body}</p>
            <ul className="space-y-1">
              {pitch.highlights.map((h, i) => (
                <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                  <span className="text-yellow-300 mt-0.5">✓</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
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
              placeholder="E-mail"
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
            Optional: Upload a short building walkthrough (≤2 minutes each, up to 3 videos). This
            helps us deliver{" "}
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

// Helper to get video duration
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Failed to load video metadata"));
    video.src = URL.createObjectURL(file);
  });
}
