import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    // Your actual webhook logic here
    return NextResponse.json({ ok: true, slug });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Webhook error" },
      { status: 400 }
    );
  }
}
