import { NextRequest, NextResponse } from "next/server";
import {
  authorizeN8nOutlook,
  getN8nBearerToken,
} from "@/lib/integrations/n8n/outlook-auth";
import { processOutlookInboundMessage } from "@/lib/integrations/n8n/outlook-service";
import { outlookInboundMessageSchema } from "@/lib/integrations/n8n/outlook-types";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const integrationToken = getN8nBearerToken(authorization);
  if (!integrationToken || !authorizeN8nOutlook(authorization)) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401, headers: responseHeaders },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 256_000) {
    return NextResponse.json(
      { ok: false, error: "The Outlook message payload is too large." },
      { status: 413, headers: responseHeaders },
    );
  }

  const parsed = outlookInboundMessageSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "The Outlook message payload is invalid.",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 12),
      },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const result = await processOutlookInboundMessage(parsed.data, integrationToken);
    return NextResponse.json({ ok: true, data: result }, { headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { ok: false, error: "RELAY could not process the Outlook message." },
      { status: 503, headers: responseHeaders },
    );
  }
}
