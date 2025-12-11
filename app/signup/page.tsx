"use client";

import { useState } from "react";

export default function SignupPage() {
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    secret_code: "",
    time_format: "12h",
    units: "imperial",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submitSignup() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Signup failed.");
      } else {
        setMessage(
          "Signup successful! Please check your email to verify your account."
        );
      }
    } catch (err) {
      console.error(err);
      setMessage("Unexpected error.");
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-r from-green-700 to-yellow-500 p-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[420px]">
        
        <h1 className="text-2xl font-bold mb-4 text-center">
          Create Your Account
        </h1>

        {message && (
          <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-center">
            {message}
          </div>
        )}

        {/* FULL NAME */}
        <input
          className="w-full border p-3 rounded mb-3"
          placeholder="Full Name"
          value={form.full_name}
          onChange={(e) =>
            setForm({ ...form, full_name: e.target.value })
          }
        />

        {/* EMAIL */}
        <input
          className="w-full border p-3 rounded mb-3"
          placeholder="Work Email"
          type="email"
          value={form.email}
          onChange={(e) =>
            setForm({ ...form, email: e.target.value })
          }
        />

        {/* SECRET ORG CODE */}
        <input
          className="w-full border p-3 rounded mb-3"
          placeholder="Organization Secret Code"
          value={form.secret_code}
          onChange={(e) =>
            setForm({ ...form, secret_code: e.target.value })
          }
        />

        {/* TIME FORMAT */}
        <select
          className="w-full border p-3 rounded mb-3"
          value={form.time_format}
          onChange={(e) =>
            setForm({ ...form, time_format: e.target.value })
          }
        >
          <option value="12h">12-Hour Format</option>
          <option value="24h">24-Hour Format</option>
        </select>

        {/* UNITS */}
        <select
          className="w-full border p-3 rounded mb-3"
          value={form.units}
          onChange={(e) =>
            setForm({ ...form, units: e.target.value })
          }
        >
          <option value="imperial">Imperial (°F, ft, lbs)</option>
          <option value="metric">Metric (°C, m, kg)</option>
        </select>

        <button
          onClick={submitSignup}
          disabled={loading}
          className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </div>
    </div>
  );
}
