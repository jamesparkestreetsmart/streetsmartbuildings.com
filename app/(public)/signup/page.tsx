"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    password: "",
    confirm_password: "",
    org_code: "",
    time_format: "12h",
    units: "imperial",
  });

  // Track whether we arrived via invite link
  const [inviteOrg, setInviteOrg] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  // Read URL params on mount — uses both useSearchParams and window.location as fallback
  useEffect(() => {
    let org = searchParams.get("org") || "";
    let email = searchParams.get("email") || "";

    // Fallback: read directly from window.location if useSearchParams returned empty
    if (!org && !email && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      org = params.get("org") || "";
      email = params.get("email") || "";
    }

    org = org.toUpperCase();
    email = email.toLowerCase();

    if (org || email) {
      setInviteOrg(org);
      setInviteEmail(email);
      setForm((prev) => ({
        ...prev,
        ...(org && { org_code: org }),
        ...(email && { email }),
      }));
    }
  }, [searchParams]);

  const isInvited = !!inviteOrg;

  const [smsConsent, setSmsConsent] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const passwordMismatch = form.confirm_password.length > 0 && form.password !== form.confirm_password;

  // Auto-format phone for display as user types (US format)
  const formatPhoneDisplay = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const isValidPhone = (value: string): boolean => {
    const digits = value.replace(/\D/g, "");
    return digits.length === 10 || (digits.length >= 11 && digits.length <= 15);
  };

  const handlePhoneChange = (value: string) => {
    setForm((prev) => ({ ...prev, phone_number: formatPhoneDisplay(value) }));
    setPhoneError("");
  };

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

    if (!form.phone_number || !isValidPhone(form.phone_number)) {
      setPhoneError("Please enter a valid phone number");
      setLoading(false);
      return;
    }

    if (!smsConsent) {
      setError("You must agree to receive SMS alerts to create an account.");
      setLoading(false);
      return;
    }

    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

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
              className={`border p-2 rounded w-full ${inviteEmail ? "bg-gray-50 text-gray-600" : ""}`}
              placeholder="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              readOnly={!!inviteEmail}
              tabIndex={inviteEmail ? -1 : undefined}
              required
            />

            <div>
              <input
                className={`border p-2 rounded w-full ${phoneError ? "border-red-400" : ""}`}
                placeholder="Phone Number"
                type="tel"
                value={form.phone_number}
                onChange={(e) => handlePhoneChange(e.target.value)}
                required
              />
              {phoneError && (
                <p className="text-xs text-red-600 mt-1">{phoneError}</p>
              )}
            </div>
            <label className="flex items-start gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                required
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                I agree to receive SMS alert notifications from Eagle Eyes Building
                Solutions LLC about facility alerts, equipment issues, and account
                updates. Message &amp; data rates may apply. Reply STOP to opt out, HELP
                for help. View our{" "}
                <a href="https://streetsmartbuildings.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">Privacy Policy</a>
                {" "}and{" "}
                <a href="https://streetsmartbuildings.com/terms" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">Terms</a>.
              </span>
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="border p-2 rounded w-full pr-16"
                placeholder="Password"
                value={form.password}
                onChange={(e) => handleChange("password", e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  className={`border p-2 rounded w-full pr-16 ${passwordMismatch ? "border-red-400" : ""}`}
                  placeholder="Confirm Password"
                  value={form.confirm_password}
                  onChange={(e) => handleChange("confirm_password", e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </div>
              {passwordMismatch && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Org code: always masked (dots), no reveal toggle */}
            <input
              type="password"
              className={`border p-2 rounded w-full ${isInvited ? "bg-gray-50 text-gray-600" : ""}`}
              placeholder="4-Letter Org Code"
              value={form.org_code}
              onChange={(e) => handleChange("org_code", e.target.value)}
              readOnly={isInvited}
              tabIndex={isInvited ? -1 : undefined}
              maxLength={4}
              required
              autoComplete="off"
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
              disabled={loading || passwordMismatch}
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
