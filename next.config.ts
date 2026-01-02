import type { NextConfig } from "next";
import dotenv from "dotenv";

// ✅ Explicitly load .env.local
dotenv.config({ path: ".env.local" });

console.log("🔍 Loaded env from .env.local");
console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Key present:", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            // anything NOT portal.streetsmartbuildings.com
            value: "^(?!portal\\.streetsmartbuildings\\.com$).*",
          },
        ],
        destination: "https://portal.streetsmartbuildings.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
