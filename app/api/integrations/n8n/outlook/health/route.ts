import { NextRequest, NextResponse } from "next/server";
import { authorizeN8nOutlook } from "@/lib/integrations/n8n/outlook-auth";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  if (!authorizeN8nOutlook(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401, headers },
    );
  }

  return NextResponse.json({
    ok: true,
    service: "RELAY Outlook intake",
    mailbox: "parts@mervynlambert.co.uk",
    mode: "read-only-ticket-workflow",
    timestamp: new Date().toISOString(),
  }, { headers });
}
