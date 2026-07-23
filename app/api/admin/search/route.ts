import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";
import type { SmartSearchResponse, SmartSearchResult, SmartSearchScope } from "@/lib/admin-smart-search";

const MAX_RESULTS_PER_ENTITY = 6;

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

function deriveAdminFromUser(user: { email?: string | null }, role: string | null) {
  const normalizedRole = role?.trim().toLowerCase() ?? "";

  if (normalizedRole === "admin") {
    return true;
  }

  const email = (user.email ?? "").trim().toLowerCase();
  const emailLocalPart = email.split("@")[0] || "";

  return email === "admin@mlp.local" || emailLocalPart.endsWith(".admin");
}

function normalizeQuery(rawValue: string) {
  return rawValue.trim().replace(/\s+/g, " ");
}

function buildIlikeOr(fields: string[], query: string) {
  const escaped = query.replace(/[%]/g, "").replace(/,/g, " ");
  return fields.map((field) => `${field}.ilike.*${escaped}*`).join(",");
}

function buildSearchScore(parts: Array<string | null | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const haystack = parts
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(Boolean)
    .join(" ");

  if (!haystack || !normalizedQuery) {
    return 0;
  }

  if (haystack === normalizedQuery) {
    return 120;
  }

  if (haystack.startsWith(normalizedQuery)) {
    return 90;
  }

  if (haystack.includes(normalizedQuery)) {
    return 60;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 15 : 0), 0);
}

function truncateSnippet(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim() || fallback;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

export async function POST(request: NextRequest) {
  try {
    const config = getSupabasePublicConfig();
    const authorization = request.headers.get("authorization");

    if (!config || !authorization) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const user = await getRelaySessionUserFromRequest(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { query?: string; scope?: SmartSearchScope };
    const query = normalizeQuery(body.query ?? "");
    const scope: SmartSearchScope = body.scope === "completed" ? "completed" : "live";

    if (query.length < 2) {
      return NextResponse.json({ error: "Enter at least 2 characters to search." }, { status: 400 });
    }

    const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role?: string | null }>();

    if (profileError) {
      throw new Error(profileError.message);
    }

    const role = typeof profileRow?.role === "string" ? profileRow.role : null;

    if (!deriveAdminFromUser(user, role)) {
      return NextResponse.json({ error: "Admin access is required for smart search." }, { status: 403 });
    }

    const warnings: string[] = [];

    const [machineRows, ticketRows, incidentRows, taskRows] = await Promise.all([
      (async () => {
        const serverTerm =
          query
            .split(/\s+/)
            .filter(Boolean)
            .sort((left, right) => right.length - left.length)[0] ?? query;
        const normalizedReference = serverTerm.replace(/[\s-]+/g, "");
        const machineSearch = buildIlikeOr(
          [
            "machine_number",
            "machine_number_normalized",
            "make",
            "model",
            "serial_number",
            "item_description",
          ],
          serverTerm,
        );
        const normalizedSearch =
          normalizedReference && normalizedReference !== serverTerm
            ? `,machine_number_normalized.ilike.*${normalizedReference}*`
            : "";
        let result = await supabase
          .from("machines")
          .select("id,machine_number,machine_number_normalized,make,model,serial_number,item_description,status,fleet_type,updated_at")
          .or(`${machineSearch}${normalizedSearch}`)
          .order("machine_number_normalized", { ascending: true })
          .limit(MAX_RESULTS_PER_ENTITY * 2);

        if (
          !result.error &&
          (result.data?.length ?? 0) === 0 &&
          normalizedReference.length >= 5 &&
          normalizedReference === serverTerm.toUpperCase()
        ) {
          const fallbackTerm = normalizedReference.slice(0, 3);
          result = await supabase
            .from("machines")
            .select("id,machine_number,machine_number_normalized,make,model,serial_number,item_description,status,fleet_type,updated_at")
            .or(
              buildIlikeOr(
                ["machine_number", "machine_number_normalized", "model"],
                fallbackTerm,
              ),
            )
            .order("machine_number_normalized", { ascending: true })
            .limit(MAX_RESULTS_PER_ENTITY * 4);
        }

        if (result.error) {
          warnings.push(`Machines: ${result.error.message}`);
          return [];
        }

        const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        return (result.data ?? []).filter((row) => {
          const haystack = [
            row.machine_number,
            row.machine_number_normalized,
            row.make,
            row.model,
            row.serial_number,
            row.item_description,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return queryTokens.every((token) => haystack.includes(token));
        });
      })(),
      (async () => {
        let ticketQuery = supabase
          .from("tickets")
          .select("id,job_number,machine_reference,requester_name,request_summary,request_details,status,department,assigned_to,notes,purchase_order_number,supplier_name,updated_at")
          .or(
            buildIlikeOr(
              [
                "job_number",
                "machine_reference",
                "requester_name",
                "request_summary",
                "request_details",
                "notes",
                "purchase_order_number",
                "supplier_name",
                "assigned_to",
              ],
              query,
            ),
          );

        ticketQuery =
          scope === "completed"
            ? ticketQuery.eq("status", "COMPLETED")
            : ticketQuery.neq("status", "COMPLETED");

        const result = await ticketQuery
          .order("updated_at", { ascending: false })
          .limit(MAX_RESULTS_PER_ENTITY * 2);

        if (result.error) {
          warnings.push(`Tickets: ${result.error.message}`);
          return [];
        }

        return result.data ?? [];
      })(),
      (async () => {
        const result = await supabase
          .from("workshop_incidents")
          .select("id,job_number,machine_reference,reported_by,description,status,severity,assigned_to,updated_at")
          .or(
            buildIlikeOr(
              ["job_number", "machine_reference", "reported_by", "description", "assigned_to"],
              query,
            ),
          )
          .order("updated_at", { ascending: false })
          .limit(MAX_RESULTS_PER_ENTITY);

        if (result.error) {
          warnings.push(`Incidents: ${result.error.message}`);
          return [];
        }

        return result.data ?? [];
      })(),
      (async () => {
        const result = await supabase
          .from("user_tasks")
          .select("id,title,description,status,assigned_to,due_at,updated_at")
          .or(buildIlikeOr(["title", "description"], query))
          .order("updated_at", { ascending: false })
          .limit(MAX_RESULTS_PER_ENTITY);

        if (result.error) {
          warnings.push(`Tasks: ${result.error.message}`);
          return [];
        }

        return result.data ?? [];
      })(),
    ]);

    const machineResults: SmartSearchResult[] = (machineRows ?? []).map((row) => ({
      entity: "machine",
      id: String(row.id),
      title: row.machine_number?.trim() || "Machine",
      subtitle:
        [row.make, row.model].filter(Boolean).join(" ") ||
        row.item_description?.trim() ||
        "Fleet machine",
      snippet: truncateSnippet(
        [row.item_description, row.serial_number ? `Serial ${row.serial_number}` : null]
          .filter(Boolean)
          .join(" · "),
        "No additional machine description recorded.",
      ),
      href: `/fleet?machine=${encodeURIComponent(String(row.machine_number_normalized || row.machine_number || ""))}`,
      meta: [row.status, row.fleet_type].filter(Boolean).join(" · ") || "Machine registry",
      score:
        buildSearchScore(
          [
            row.machine_number,
            row.machine_number_normalized,
            row.make,
            row.model,
            row.serial_number,
            row.item_description,
          ],
          query,
        ) + 30,
    }));

    const ticketResults = (ticketRows ?? []).flatMap((row) => {
      const sharedTitle = row.job_number?.trim()
        ? `Job ${row.job_number.trim()}`
        : row.machine_reference?.trim() || "Ticket";
      const sharedSubtitle = [row.status, row.requester_name].filter(Boolean).join(" · ") || "Parts request";
      const sharedSnippet = truncateSnippet(
        row.request_summary || row.request_details || row.notes,
        "No request summary provided.",
      );
      const sharedMeta = [row.department, row.assigned_to].filter(Boolean).join(" · ") || "Ticket";
      const baseScore = buildSearchScore(
        [
          row.job_number,
          row.machine_reference,
          row.requester_name,
          row.request_summary,
          row.request_details,
          row.notes,
          row.purchase_order_number,
          row.supplier_name,
        ],
        query,
      );

      const results: SmartSearchResult[] = [
        {
          entity: "ticket",
          id: String(row.id),
          title: sharedTitle,
          subtitle: sharedSubtitle,
          snippet: sharedSnippet,
          href: `/tickets/${row.id}`,
          meta: sharedMeta,
          score: baseScore + 20,
        },
      ];

      if (
        row.status === "ORDERED" ||
        row.status === "READY" ||
        row.status === "COMPLETED" ||
        row.purchase_order_number?.trim() ||
        row.supplier_name?.trim()
      ) {
        results.push({
          entity: "order",
          id: `${row.id}-order`,
          title: row.purchase_order_number?.trim()
            ? `PO ${row.purchase_order_number.trim()}`
            : sharedTitle,
          subtitle: row.supplier_name?.trim()
            ? `${row.supplier_name.trim()} · ${row.status ?? "ORDER"}`
            : row.status ?? "ORDER",
          snippet: sharedSnippet,
          href: `/tickets/${row.id}`,
          meta: [row.purchase_order_number, row.supplier_name].filter(Boolean).join(" · ") || "Order record",
          score: baseScore + 10,
        });
      }

      return results;
    });

    const incidentResults: SmartSearchResult[] = (incidentRows ?? []).map((row) => ({
      entity: "incident",
      id: String(row.id),
      title: row.job_number?.trim() ? `Incident Job ${row.job_number.trim()}` : row.machine_reference?.trim() || "Incident",
      subtitle: [row.status, row.severity].filter(Boolean).join(" · ") || "Workshop incident",
      snippet: truncateSnippet(row.description, "No incident description provided."),
      href: `/incidents/${row.id}`,
      meta: [row.reported_by, row.assigned_to].filter(Boolean).join(" · ") || "Workshop Control",
      score: buildSearchScore(
        [row.job_number, row.machine_reference, row.reported_by, row.description, row.assigned_to],
        query,
      ) + 12,
    }));

    const taskResults: SmartSearchResult[] = (taskRows ?? []).map((row) => ({
      entity: "task",
      id: String(row.id),
      title: row.title?.trim() || "Task",
      subtitle: row.status?.trim() || "Task",
      snippet: truncateSnippet(row.description, "No task description provided."),
      href: "/incidents/tasks",
      meta: [row.assigned_to, row.due_at].filter(Boolean).join(" · ") || "Workshop task",
      score: buildSearchScore([row.title, row.description], query) + 4,
    }));

    const response: SmartSearchResponse = {
      query,
      scope,
      results: [
        ...machineResults,
        ...ticketResults,
        ...incidentResults,
        ...taskResults,
      ]
        .sort((left, right) => right.score - left.score)
        .slice(0, 24),
    };

    if (response.results.length === 0 && warnings.length > 0) {
      return NextResponse.json(
        { error: `Smart search partial failure. ${warnings.join(" | ")}` },
        { status: 500 },
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Smart search is unavailable right now.";
    console.error("Admin smart search failed", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
