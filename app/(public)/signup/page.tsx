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
    setForm(prev => ({
      ...prev,
      [field]: field === "org_code" ? value.toUpperCase() : value,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col md:flex-row">

        {/* Left Panel */}
        <div className="hidden md:flex md:flex-col md:justify-between bg-gradient-to-b from-green-700 to-emerald-500 text-white p-6 w-1/2">
          <div>
            <h1 className="text-2xl font-bold mb-2">Street Smart Buildings</h1>
            <p className="text-sm text-emerald-100">
              Remote facility management powered by Eagle Eyes.
            </p>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-full md:w-1/2 p-6">
          <h2 className="text-xl font-semibold mb-4 text-center text-gray-900">
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

          <form onSubmit={handleSubmit} className="space-y-3">

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
              placeholder="Email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
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
              placeholder="Org Code"
              value={form.org_code}
              onChange={(e) => handleChange("org_code", e.target.value)}
              maxLength={4}
              required
            />

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
