import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function hasValidSecret(request: NextRequest) {
  const expected = process.env.NEXUS_RELAY_ORDER_KEY ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return Boolean(
    expected &&
      provided &&
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer),
  );
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: "Invalid API credentials" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "RELAY order intake is not configured" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const nexusOrderId = String(body.nexusOrderId ?? "").trim();
    const lines = body.lines;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(nexusOrderId)) {
      return NextResponse.json({ error: "A valid NEXUS order ID is required" }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "At least one order line is required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("accept_nexus_ecommerce_order", {
      p_nexus_order_id: nexusOrderId,
      p_external_order_id: String(body.externalOrderId ?? "").trim() || null,
      p_order_number: String(body.orderNumber ?? "").trim(),
      p_currency: String(body.currency ?? "").trim() || null,
      p_customer_name: String(body.customerName ?? "").trim() || null,
      p_customer_email: String(body.customerEmail ?? "").trim() || null,
      p_customer_phone: String(body.customerPhone ?? "").trim() || null,
      p_delivery_address: String(body.deliveryAddress ?? "").trim() || null,
      p_lines: lines,
    });
    if (error) throw error;
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Order intake failed" },
      { status: 500 },
    );
  }
}
