"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

export default function LandingPageUI() {
  const [leadEmail, setLeadEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [videos, setVideos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  /* ============================
     VIDEO SELECTION
     ============================ */
  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);

    if (files.length + videos.length > 3) {
      setError("You can upload up to 3 videos maximum.");
      return;
    }

    for (const file of files) {
      if (file.size > 250 * 1024 * 1024) {
        setError("Each video must be under 250MB.");
        return;
      }
    }

    setVideos((prev) => [...prev, ...files]);
  }

  /* ============================
     VIDEO UPLOAD
     ============================ */
  async function uploadVideos() {
    setUploading(true);

    try {
      for (const file of videos) {
        // Detect duration (client-side)
        const duration = await new Promise<number>((resolve, reject) => {
          const video = document.createElement("video");
          video.preload = "metadata";
          video.onloadedmetadata = () => resolve(video.duration);
          video.onerror = () => reject();
          video.src = URL.createObjectURL(file);
        });

        if (duration > 120) {
          throw new Error("Each video must be 2 minutes or less.");
        }

        // Request signed upload URL
        const res = await fetch("/api/leads/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: leadEmail,
            filename: file.name,
            contentType: file.type,
            fileSizeBytes: file.size,
            durationSeconds: Math.ceil(duration),
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to prepare video upload.");
        }

        const { uploadUrl } = await res.json();

        // Upload directly to Supabase Storage
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Video upload failed.");
        }
      }

      // Confirm uploads
      await fetch("/api/leads/confirm-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: leadEmail }),
      });
    } finally {
      setUploading(false);
    }
  }

  /* ============================
     LEAD SUBMIT
     ============================ */
  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      if (videos.length > 0) {
        await uploadVideos();
      }

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail,
          source_page: "landing",
          utm: null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Unable to submit email.");
        return;
      }

      setMessage("Thanks! We'll reach out shortly.");
      setLeadEmail("");
      setVideos([]);
    } catch (err: any) {
      setError(err.message || "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ============================
     UI
     ============================ */
  return (
    <div className="min-h-screen flex">
      {/* LEFT SIDE — LEAD CAPTURE */}
      <div className="flex-1 text-white p-16 flex flex-col justify-center bg-gradient-to-r from-green-700 to-yellow-500">
        <h1 className="text-4xl font-bold mb-6">Street Smart Buildings</h1>

        <p className="text-lg max-w-xl">
          Remote facility management, real-time monitoring, and predictive
          insights—powered by Eagle Eyes.
        </p>

        <form
          onSubmit={handleLeadSubmit}
          className="mt-10 bg-white/10 p-6 rounded-lg backdrop-blur-sm max-w-md"
        >
          <p className="font-semibold mb-2">Enter your email to learn more:</p>

          <input
            type="email"
            placeholder="you@example.com"
            className="w-full p-2 rounded text-black"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            required
          />

          {/* VIDEO UPLOAD */}
          <div className="mt-4">
            <label className="block text-sm font-semibold mb-1">
              Optional: Upload up to 3 videos (2 min max each)
            </label>

            <input
              type="file"
              accept="video/*"
              multiple
              onChange={handleVideoSelect}
              className="w-full text-sm text-white"
            />

            {videos.length > 0 && (
              <ul className="mt-2 text-xs">
                {videos.map((v, i) => (
                  <li key={i}>🎥 {v.name}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || uploading}
            className="mt-4 w-full bg-white text-green-700 font-bold py-2 rounded disabled:opacity-50"
          >
            {uploading
              ? "Uploading videos..."
              : loading
              ? "Submitting..."
              : "Submit"}
          </button>

          {message && (
            <div className="mt-3 text-emerald-200 text-sm">{message}</div>
          )}
          {error && (
            <div className="mt-3 text-red-300 text-sm">{error}</div>
          )}
        </form>
      </div>

      {/* RIGHT SIDE — LOGIN */}
      <div className="w-[40%] flex items-center justify-center p-16 bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-10 w-full max-w-sm">
          <h2 className="text-2xl font-bold text-center mb-6">Login</h2>

          <LoginForm />

          <div className="text-center mt-4 text-sm">
            New here?{" "}
            <a href="/signup" className="text-green-700 font-bold">
              Create an account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
