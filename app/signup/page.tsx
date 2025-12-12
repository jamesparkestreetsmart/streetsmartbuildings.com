// app/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    org_code: "",
    time_format: "12h",
    units: "imperial",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]:
        field === "org_code" ? value.toUpperCase() : value, // always uppercase org code
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Sign up failed.");
        return;
      }

      setSuccessMessage("Account created. Redirecting…");

      // After signup, server has set the auth cookie, so /live will see them as logged in
      setTimeout(() => {
        router.push("/live");
      }, 800);
    } catch (err) {
      console.error(err);
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-green-700 to-yellow-500 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col md:flex-row">
        {/* Left panel — marketing / brand */}
        <div className="hidden md:flex md:flex-col md:justify-between bg-gradient-to-b from-green-700 to-emerald-500 text-white p-6 w-1/2">
          <div>
            <h1 className="text-2xl font-bold mb-2">Street Smart Buildings</h1>
            <p className="text-sm text-emerald-100">
              Remote facility management for QSR, retail, and more — built by
              Eagle Eyes Building Solutions.
            </p>
          </div>
          <div className="text-xs text-emerald-100 mt-6">
            <p>• Live equipment monitoring</p>
            <p>• Store schedules & automation</p>
            <p>• Multi-organization support</p>
          </div>
          <div className="text-[11px] text-emerald-100 mt-6">
            You need <span className="font-semibold">Eagle Eyes</span> — we'll
            bring the ladder.
          </div>
        </div>

        {/* Right panel — signup form */}
        <div className="w-full md:w-1/2 p-6">
          <h2 className="text-xl font-semibold mb-1 text-gray-900 text-center">
            Create Your Account
          </h2>
          <p className="text-xs text-gray-500 mb-4 text-center">
            Use the email and 4-letter org code provided by your project lead.
          </p>

          {error && (
            <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-2 py-2 text-sm"
                  value={form.first_name}
                  onChange={(e) =>
                    handleChange("first_name", e.target.value)
                  }
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-2 py-2 text-sm"
                  value={form.last_name}
                  onChange={(e) =>
                    handleChange("last_name", e.target.value)
                  }
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded-md px-2 py-2 text-sm"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Password
              </label>
              <input
                type="password"
                className="w-full border rounded-md px-2 py-2 text-sm"
                value={form.password}
                onChange={(e) => handleChange("password", e.target.value)}
                minLength={8}
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Minimum 8 characters.
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Organization Code
              </label>
              <input
                type="text"
                className="w-full border rounded-md px-2 py-2 text-sm tracking-[0.2em] uppercase"
                value={form.org_code}
                onChange={(e) => handleChange("org_code", e.target.value)}
                maxLength={4}
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">
                4-letter code (e.g., PARK). Must match your organization.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Time Format
                </label>
                <select
                  className="w-full border rounded-md px-2 py-2 text-sm"
                  value={form.time_format}
                  onChange={(e) =>
                    handleChange("time_format", e.target.value)
                  }
                >
                  <option value="12h">12-hour (3:30 PM)</option>
                  <option value="24h">24-hour (15:30)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Units
                </label>
                <select
                  className="w-full border rounded-md px-2 py-2 text-sm"
                  value={form.units}
                  onChange={(e) => handleChange("units", e.target.value)}
                >
                  <option value="imperial">Imperial (°F, ft²)</option>
                  <option value="metric">Metric (°C, m²)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-green-700 hover:bg-green-800 text-white py-2 rounded-md text-sm font-semibold disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-gray-500">
            Already have an account?{" "}
            <a href="/" className="text-green-700 hover:underline">
              Log in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
