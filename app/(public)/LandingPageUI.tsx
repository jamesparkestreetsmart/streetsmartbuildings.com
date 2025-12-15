"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

export default function LandingPageUI() {
  const [leadEmail, setLeadEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: leadEmail }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        setError(error || "Unable to submit email.");
        return;
      }

      setMessage("Thanks! We'll reach out shortly.");
      setLeadEmail("");

    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      
      {/* LEFT SIDE */}
      <div className="flex-1 text-white p-16 flex flex-col justify-center bg-gradient-to-r from-green-700 to-yellow-500">
        <h1 className="text-4xl font-bold mb-6">Street Smart Buildings</h1>
        <p className="text-lg max-w-xl">
          Remote facility management, real-time monitoring, and predictive insights—
          powered by Eagle Eyes.
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

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full bg-white text-green-700 font-bold py-2 rounded disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit"}
          </button>

          {message && <div className="mt-3 text-emerald-200 text-sm">{message}</div>}
          {error && <div className="mt-3 text-red-300 text-sm">{error}</div>}
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
