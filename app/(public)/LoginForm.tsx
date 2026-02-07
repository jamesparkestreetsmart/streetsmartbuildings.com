"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message || "Login failed.");
        return;
      }

      // Redirect admin users to /admin, others to /live
      if (email.toLowerCase().endsWith("@streetsmartbuildings.com")) {
        router.push("/admin");
      } else {
        router.push("/live");
      }
    } catch (err) {
      console.error(err);
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {error && (
        <div className="bg-red-100 text-red-700 border border-red-200 p-2 rounded text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded font-semibold disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

    </form>
  );
}
