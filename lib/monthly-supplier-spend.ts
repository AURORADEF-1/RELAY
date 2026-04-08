import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMonthlySupplierSpendSnapshots,
  type MonthlySupplierSpendSnapshot,
} from "@/lib/order-analytics";

type TicketSnapshotRow = {
  id: string;
  ordered_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  supplier_name: string | null;
  order_amount: number | null;
  purchase_order_number: string | null;
  status: string | null;
};

export async function fetchMonthlySupplierSpendSnapshots(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase
    .from("supplier_monthly_spend_snapshots")
    .select("*")
    .order("month_start", { ascending: false })
    .order("total_spend", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as MonthlySupplierSpendSnapshot[];
}

export async function backfillMonthlySupplierSpendSnapshots(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, ordered_at, updated_at, created_at, supplier_name, order_amount, purchase_order_number, status")
    .in("status", ["ORDERED", "READY", "COMPLETED"])
    .not("supplier_name", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const snapshots = buildMonthlySupplierSpendSnapshots((data ?? []) as TicketSnapshotRow[]);

  const { error: deleteError } = await supabase
    .from("supplier_monthly_spend_snapshots")
    .delete()
    .not("month_start", "is", null);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (snapshots.length === 0) {
    return [];
  }

  const { error: insertError } = await supabase
    .from("supplier_monthly_spend_snapshots")
    .insert(snapshots);

  if (insertError) {
    throw new Error(insertError.message);
  }

  return snapshots;
}

export async function syncMonthlySupplierSpendSnapshotsForMonth(
  supabase: SupabaseClient,
  monthStart: string,
) {
  const monthEnd = getNextMonthStart(monthStart);
  const { data, error } = await supabase
    .from("tickets")
    .select("id, ordered_at, updated_at, created_at, supplier_name, order_amount, purchase_order_number, status")
    .gte("ordered_at", monthStart)
    .lt("ordered_at", monthEnd)
    .not("supplier_name", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const snapshots = buildMonthlySupplierSpendSnapshots((data ?? []) as TicketSnapshotRow[]).filter(
    (snapshot) => snapshot.month_start === monthStart,
  );

  const { error: deleteError } = await supabase
    .from("supplier_monthly_spend_snapshots")
    .delete()
    .eq("month_start", monthStart);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (snapshots.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("supplier_monthly_spend_snapshots")
    .insert(snapshots);

  if (insertError) {
    throw new Error(insertError.message);
  }
}

function getNextMonthStart(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  const nextMonth = new Date(year, month, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
}
