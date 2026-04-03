// app/api/deployments/list/route.ts

import { NextResponse } from "next/server";

const API_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = searchParams.get("hours") || "24";
  const site_id = searchParams.get("site_id") || "";

  try {
    const params = new URLSearchParams({ hours });
    if (site_id) params.set("site_id", site_id);

    const res = await fetch(
      `${API_URL}/ops/history?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Backend error" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 503 });
  }
}