import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

// POST: Use Claude to suggest column mapping (authenticated users only)
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  const { headers, sampleRows } = await req.json();

  if (!headers || !Array.isArray(headers)) {
    return NextResponse.json({ error: "headers required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI mapping not configured" }, { status: 500 });
  }

  const systemPrompt = `You are a column mapper. Given spreadsheet headers and sample data, map them to these target fields:
- region_name: The region/group/area name
- dm_email: District manager or user email
- dm_name: District manager or user name
- site_name: Store/site/location name
- site_code: Store number, site code, or location ID

Return ONLY a JSON object mapping target field names to the source column header that best matches.
Only include fields that have a clear match. Example: {"region_name": "Region", "dm_email": "DM Email", "site_code": "Store #"}`;

  const userContent = `Headers: ${JSON.stringify(headers)}\n\nSample rows:\n${(sampleRows || [])
    .map((row: string[]) => JSON.stringify(row))
    .join("\n")}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json({ mapping: {} });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "{}";

    // Extract JSON from response (may contain markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const mapping = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return NextResponse.json({ mapping });
  } catch (err) {
    console.error("AI mapping suggestion failed:", err);
    return NextResponse.json({ mapping: {} });
  }
}
