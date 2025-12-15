import type { NextConfig } from "next";
import dotenv from "dotenv";

// ✅ Explicitly load .env.local
dotenv.config({ path: ".env.local" });

console.log("🔍 Loaded env from .env.local");
console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Key present:", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// ✅ Removed deprecated eslint block
const nextConfig: NextConfig = {};

export default nextConfig;
