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

      setTimeout(() => {
        router.push("/live");
      }, 800);
    } catch (err) {
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
          <h2 className="text-xl font-semibold mb-1 text-center text-gray-900">
            Create Your Account
          </h2>

          {error && (
            <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* name, email, password, org code, prefs */}
            ...
          </form>
        </div>
      </div>
    </div>
  );
}
