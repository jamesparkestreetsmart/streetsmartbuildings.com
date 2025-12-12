"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Invalid login credentials.");
      return;
    }

    window.location.href = "/live";
  };

  return (
    <form onSubmit={handleLogin} className="space-y-3">
      {error && (
        <div className="bg-red-100 text-red-700 p-2 text-sm rounded">
          {error}
        </div>
      )}

      <input
        type="email"
        className="w-full border p-2 rounded"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <input
        type="password"
        className="w-full border p-2 rounded"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button
        type="submit"
        className="w-full bg-green-700 hover:bg-green-800 text-white p-2 rounded"
      >
        Sign In
      </button>
    </form>
  );
}
