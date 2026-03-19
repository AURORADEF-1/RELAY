import { NextRequest, NextResponse } from "next/server";
import { isAllowedMediaProxySource } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("src");

  if (!source) {
    return NextResponse.json({ error: "Missing src parameter." }, { status: 400 });
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(source);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (!isAllowedMediaProxySource(targetUrl.toString())) {
    return NextResponse.json({ error: "Image source is not allowed." }, { status: 400 });
  }

  const upstream = await fetch(targetUrl.toString(), {
    cache: "no-store",
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: "Failed to fetch image." }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") || "image/png";

  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported media type." }, { status: 415 });
  }

  const buffer = await upstream.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
