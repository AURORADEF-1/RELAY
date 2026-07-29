import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  authorizeRicoFleetFeed,
  getBearerToken,
} from "@/lib/integrations/rico/feed-auth";
import { getRicoFleetFeedPage } from "@/lib/integrations/rico/feed-client";
import { parseRicoFleetFeedQuery } from "@/lib/integrations/rico/feed-types";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const partnerToken = getBearerToken(authorization);

  if (!partnerToken || !authorizeRicoFleetFeed(authorization)) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401, headers: responseHeaders },
    );
  }

  try {
    const query = parseRicoFleetFeedQuery(request.nextUrl.searchParams);
    const page = await getRicoFleetFeedPage(query, partnerToken);
    const { excludedCount, ...responsePage } = page;

    return NextResponse.json(
      {
        ok: true,
        generated_at: new Date().toISOString(),
        updated_since: query.updatedSince,
        ...responsePage,
        excluded: {
          missing_or_placeholder_serial: excludedCount,
        },
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid query parameters.",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers: responseHeaders },
      );
    }

    return NextResponse.json(
      { ok: false, error: "The RELAY fleet feed is temporarily unavailable." },
      { status: 503, headers: responseHeaders },
    );
  }
}
