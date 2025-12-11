"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const router = useRouter();

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Email-capture state
  const [learnMoreEmail, setLearnMoreEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(error.message);
      return;
    }

    router.push("/sites");
  }

  async function handleEmailCapture(e: React.FormEvent) {
    e.preventDefault();

    // Store email in your marketing table
    await supabase.from("marketing_leads").insert({
      email: learnMoreEmail,
    });

    setSubmitted(true);
  }

  return (
    <div
      className="min-h-screen flex"
      style={{
        background: "linear-gradient(to right, #0b7d63, #e0b300)",
      }}
    >
      {/* LEFT SIDE */}
      <div className="flex-1 text-white p-16 flex flex-col justify-center">
        <h1 className="text-3xl font-bold mb-2">
          Eagle Eyes Building Solutions
        </h1>

        <h2 className="text-5xl font-extrabold mb-6">
          StreetSmart Buildings Platform
        </h2>

        <p className="text-lg mb-6 max-w-xl">
          Remote facility management, real-time monitoring, and predictive
          intelligence for multi-site restaurant operations.
        </p>

        <ul className="list-disc ml-6 space-y-2 text-md max-w-xl">
          <li>HVAC, walk-in, water, and electrical monitoring</li>
          <li>Predictive failures via energy signatures</li>
          <li>Real-time alerts and benchmarking</li>
          <li>Remote setpoint control + automation</li>
        </ul>

        {/* EMAIL CAPTURE BOX */}
        <div className="mt-10 bg-white/10 backdrop-blur-sm p-6 rounded-lg max-w-md">
          {!submitted ? (
            <form onSubmit={handleEmailCapture}>
              <label className="block mb-2 font-semibold">
                Enter your email to learn more:
              </label>

              <input
                type="email"
                placeholder="you@example.com"
                className="w-full p-2 rounded text-black"
                value={learnMoreEmail}
                onChange={(e) => setLearnMoreEmail(e.target.value)}
                required
              />

              <button
                type="submit"
                className="mt-4 w-full bg-white text-green-700 font-bold py-2 rounded hover:bg-gray-100"
              >
                Submit
              </button>
            </form>
          ) : (
            <div className="text-green-200 font-semibold">
              Thank you! We will reach out shortly.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDE — LOGIN */}
      <div className="w-[38%] flex items-center justify-center p-16">
        <div className="p-[2px] rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #0b7d63, #e0b300)",
          }}
        >
          <div className="bg-white rounded-2xl p-10 shadow-xl w-full max-w-sm">
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
              Login
            </h2>

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block font-semibold mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border rounded p-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Password</label>
                <input
                  type="password"
                  className="w-full border rounded p-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {loginError && (
                <div className="bg-red-100 text-red-700 px-3 py-2 rounded">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-green-700 text-white py-2 rounded font-bold hover:bg-green-800"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
