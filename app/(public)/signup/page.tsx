"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
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
      [field]: field === "org_code" ? value.toUpperCase() : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Sign up failed.");
        return;
      }

      setSuccessMessage("Account created. Redirecting…");
      setTimeout(() => router.push("/live"), 800);

    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-green-700 to-yellow-500 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col md:flex-row">

        {/* LEFT SIDE — BRANDING */}
        <div className="hidden md:flex flex-col justify-between bg-gradient-to-b from-green-800 to-green-700 text-white p-8 w-1/2 relative overflow-hidden">

          <div className="relative z-10">
            <p className="text-xs tracking-widest uppercase text-yellow-300 font-semibold">
              Eagle Eyes Building Solutions LLC
            </p>
            <h1 className="text-3xl font-bold mt-2">Street Smart Buildings</h1>
            <p className="mt-3 text-sm text-green-100 leading-relaxed">
              Our Facility Communication Platform provides{" "}
              <span className="text-yellow-300 font-semibold">more Reliable</span> &{" "}
              <span className="text-yellow-300 font-semibold">more Affordable</span>{" "}
              Remote Asset Monitoring & Control
            </p>
          </div>

          <div className="relative z-10">
            <p className="text-sm font-bold tracking-widest uppercase text-yellow-300">
              How We Think
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
              <div className="bg-white/10 rounded p-2.5">
                <span className="font-semibold text-yellow-300">Data</span>
                <p className="text-green-200 mt-0.5">Sensors & meters across your facility</p>
              </div>
              <div className="bg-white/10 rounded p-2.5">
                <span className="font-semibold text-yellow-300">Information</span>
                <p className="text-green-200 mt-0.5">Context against schedules & setpoints</p>
              </div>
              <div className="bg-white/10 rounded p-2.5">
                <span className="font-semibold text-yellow-300">Knowledge</span>
                <p className="text-green-200 mt-0.5">Anomalies, waste & degradation detected</p>
              </div>
              <div className="bg-white/10 rounded p-2.5">
                <span className="font-semibold text-yellow-300">Wisdom</span>
                <p className="text-green-200 mt-0.5">Actions that reduce cost & extend life</p>
              </div>
            </div>
          </div>

          <div className="relative z-10" />
        </div>

        {/* RIGHT SIDE — SIGNUP FORM */}
        <div className="w-full md:w-1/2 p-8">
          <h2 className="text-xl font-semibold text-center text-gray-900 mb-4">
            Create Your Account
          </h2>

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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-3">
              <input
                className="border p-2 rounded w-1/2"
                placeholder="First Name"
                value={form.first_name}
                onChange={(e) => handleChange("first_name", e.target.value)}
                required
              />
              <input
                className="border p-2 rounded w-1/2"
                placeholder="Last Name"
                value={form.last_name}
                onChange={(e) => handleChange("last_name", e.target.value)}
                required
              />
            </div>

            <input
              className="border p-2 rounded w-full"
              placeholder="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              required
            />

            <input
              className="border p-2 rounded w-full"
              placeholder="Phone Number"
              type="tel"
              value={form.phone_number}
              onChange={(e) => handleChange("phone_number", e.target.value)}
              required
            />

            <input
              type="password"
              className="border p-2 rounded w-full"
              placeholder="Password"
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              required
              minLength={8}
            />

            <input
              className="border p-2 rounded w-full tracking-[0.25em] uppercase"
              placeholder="4-Letter Org Code"
              value={form.org_code}
              onChange={(e) => handleChange("org_code", e.target.value)}
              maxLength={4}
              required
            />

            <div className="flex gap-3">
              <select
                className="border p-2 rounded w-1/2"
                value={form.time_format}
                onChange={(e) => handleChange("time_format", e.target.value)}
              >
                <option value="12h">12-Hour Time</option>
                <option value="24h">24-Hour Time</option>
              </select>

              <select
                className="border p-2 rounded w-1/2"
                value={form.units}
                onChange={(e) => handleChange("units", e.target.value)}
              >
                <option value="imperial">Imperial (°F)</option>
                <option value="metric">Metric (°C)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded font-semibold disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm mt-4">
            Already have an account?{" "}
            <a href="/" className="text-green-700 font-semibold hover:underline">
              Log in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}