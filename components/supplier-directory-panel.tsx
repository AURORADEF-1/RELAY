"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSupplierBriefText,
  buildSupplierMailtoHref,
  buildSupplierSuggestionOptions,
  buildSupplierWhatsAppHref,
  isLikelyInvalidSupplierName,
  type SupplierDirectoryEntry,
  type SupplierPreferredContactMethod,
  type SupplierWorkflowStage,
} from "@/lib/supplier-directory";
import { formatOperationalDate, formatOrderAmount } from "@/lib/ticket-operational";
import { getSupabaseAccessToken } from "@/lib/supabase";

type SupplierDirectoryResponse = {
  generatedAt: string;
  suppliers: SupplierDirectoryEntry[];
  supplierOptions: string[];
  contactsConfigured: boolean;
};

type SupplierContactDraft = {
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  preferredContactMethod: SupplierPreferredContactMethod | "";
  workflowStage: SupplierWorkflowStage | "";
  notes: string;
};

const DEFAULT_DRAFT: SupplierContactDraft = {
  contactEmail: "",
  contactPhone: "",
  whatsappNumber: "",
  preferredContactMethod: "",
  workflowStage: "draft",
  notes: "",
};

export function SupplierDirectoryPanel() {
  const [suppliers, setSuppliers] = useState<SupplierDirectoryEntry[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [supplierNameDraft, setSupplierNameDraft] = useState("");
  const [isEditingSupplierName, setIsEditingSupplierName] = useState(false);
  const [draft, setDraft] = useState<SupplierContactDraft>(DEFAULT_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [contactsConfigured, setContactsConfigured] = useState(true);
  const selectedSupplierNameRef = useRef("");

  const setDraftFromSupplier = useCallback((supplier: SupplierDirectoryEntry) => {
    setDraft({
      contactEmail: supplier.contactEmail ?? supplier.latestTicketSupplierEmail ?? "",
      contactPhone: supplier.contactPhone ?? "",
      whatsappNumber: supplier.whatsappNumber ?? supplier.contactPhone ?? "",
      preferredContactMethod: supplier.preferredContactMethod ?? "",
      workflowStage: supplier.workflowStage ?? "draft",
      notes: supplier.notes ?? "",
    });
  }, []);

  useEffect(() => {
    selectedSupplierNameRef.current = selectedSupplierName;
  }, [selectedSupplierName]);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setNotice(null);

    try {
      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch("/api/admin/suppliers", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json()) as SupplierDirectoryResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load the supplier directory.");
      }

      setSuppliers(payload.suppliers ?? []);
      setSupplierOptions(buildSupplierSuggestionOptions(payload.supplierOptions ?? []));
      setGeneratedAt(payload.generatedAt ?? "");
      setContactsConfigured(payload.contactsConfigured ?? true);

      const nextSelected =
        payload.suppliers?.find(
          (supplier) =>
            supplier.normalizedSupplierName ===
            normalizeSelectionKey(selectedSupplierNameRef.current),
        ) ?? payload.suppliers?.[0] ?? null;

      if (nextSelected) {
        setSelectedSupplierName(nextSelected.supplierName);
        setSupplierNameDraft(nextSelected.supplierName);
        setIsEditingSupplierName(false);
        setDraftFromSupplier(nextSelected);
      } else {
        setSelectedSupplierName("");
        setSupplierNameDraft("");
        setIsEditingSupplierName(false);
        setDraft(DEFAULT_DRAFT);
      }
    } catch (error) {
      setSuppliers([]);
      setSupplierOptions([]);
      setSelectedSupplierName("");
      setSupplierNameDraft("");
      setIsEditingSupplierName(false);
      setDraft(DEFAULT_DRAFT);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load the supplier directory.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [setDraftFromSupplier]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSuppliers();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return suppliers;
    }

    return suppliers.filter((supplier) => {
      const haystack = [
        supplier.supplierName,
        supplier.contactEmail,
        supplier.contactPhone,
        supplier.whatsappNumber,
        supplier.workflowStage,
        supplier.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [searchTerm, suppliers]);

  const selectedSupplier = useMemo(() => {
    const exactSelected =
      suppliers.find((supplier) => supplier.supplierName === selectedSupplierName) ?? null;

    if (exactSelected) {
      return exactSelected;
    }

    if (searchTerm.trim()) {
      return filteredSuppliers[0] ?? null;
    }

    return suppliers[0] ?? null;
  }, [filteredSuppliers, searchTerm, selectedSupplierName, suppliers]);

  useEffect(() => {
    if (!selectedSupplier) {
      return;
    }

    setSupplierNameDraft(selectedSupplier.supplierName);
    setIsEditingSupplierName(false);
    setDraftFromSupplier(selectedSupplier);
  }, [selectedSupplier, setDraftFromSupplier]);

  const supplierSuggestions = useMemo(
    () => buildSupplierSuggestionOptions(supplierOptions),
    [supplierOptions],
  );

  const selectedSupplierDispatchLabel = useMemo(() => {
    if (!selectedSupplier) {
      return "Records only";
    }

    const hasEmail = Boolean(selectedSupplier.contactEmail?.trim() || selectedSupplier.latestTicketSupplierEmail?.trim());
    const hasPhone = Boolean(selectedSupplier.whatsappNumber?.trim() || selectedSupplier.contactPhone?.trim());

    if (selectedSupplier.preferredContactMethod === "email" && hasEmail) {
      return "Email";
    }

    if (
      (selectedSupplier.preferredContactMethod === "whatsapp" ||
        selectedSupplier.preferredContactMethod === "phone") &&
      hasPhone
    ) {
      return "WhatsApp";
    }

    if (hasEmail) {
      return "Email";
    }

    if (hasPhone) {
      return "WhatsApp";
    }

    return "Records only";
  }, [selectedSupplier]);

  const mergeSuggestionName = useMemo(() => {
    if (!selectedSupplier || !isEditingSupplierName) {
      return null;
    }

    const currentDraft = supplierNameDraft.trim() || selectedSupplier.supplierName;
    const exactDuplicate = suppliers.find(
      (supplier) =>
        supplier.normalizedSupplierName === normalizeSelectionKey(currentDraft) &&
        supplier.normalizedSupplierName !== selectedSupplier.normalizedSupplierName,
    );

    if (exactDuplicate) {
      return exactDuplicate.supplierName;
    }

    return findClosestSupplierName(
      currentDraft,
      suppliers,
      selectedSupplier.normalizedSupplierName,
    );
  }, [isEditingSupplierName, selectedSupplier, supplierNameDraft, suppliers]);

  const handleSave = useCallback(async () => {
    const originalSupplierName = selectedSupplier?.supplierName?.trim() || supplierNameDraft.trim();
    const nextSupplierName = supplierNameDraft.trim();
    const originalNormalizedSupplierName = normalizeSelectionKey(originalSupplierName);
    const nextNormalizedSupplierName = normalizeSelectionKey(nextSupplierName);

    if (!nextSupplierName) {
      setNotice({
        type: "error",
        message: "Supplier name is required.",
      });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch("/api/admin/suppliers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          originalSupplierName,
          supplierName: nextSupplierName,
          contactEmail: draft.contactEmail,
          contactPhone: draft.contactPhone,
          whatsappNumber: draft.whatsappNumber,
          preferredContactMethod: draft.preferredContactMethod || null,
          workflowStage: draft.workflowStage || null,
          notes: draft.notes,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        supplier?: SupplierDirectoryEntry;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save supplier contact details.");
      }

      if (payload.supplier) {
        const previousSupplierName = originalSupplierName.trim();
        setSuppliers((current) => {
          const nextEntry = payload.supplier as SupplierDirectoryEntry;
          const withoutPrevious = current.filter(
            (supplier) =>
              normalizeSelectionKey(supplier.supplierName) !==
              normalizeSelectionKey(previousSupplierName),
          );
          const withoutDuplicate = withoutPrevious.filter(
            (supplier) => supplier.normalizedSupplierName !== nextEntry.normalizedSupplierName,
          );

          return [nextEntry, ...withoutDuplicate];
        });
        setSupplierOptions((current) =>
          buildSupplierSuggestionOptions([
            payload.supplier?.supplierName ?? nextSupplierName,
            ...current.filter(
              (option) =>
                normalizeSelectionKey(option) !== normalizeSelectionKey(previousSupplierName),
            ),
          ]),
        );
        setSelectedSupplierName(payload.supplier.supplierName);
        setSupplierNameDraft(payload.supplier.supplierName);
        setIsEditingSupplierName(false);
        setDraftFromSupplier(payload.supplier);
      }

      setNotice({
        type: "success",
        message:
          originalNormalizedSupplierName !== nextNormalizedSupplierName
            ? `Merged supplier into ${nextSupplierName}.`
            : `Saved supplier ${nextSupplierName}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save supplier contact details.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [draft, selectedSupplier, setDraftFromSupplier, supplierNameDraft]);

  const handleCreate = useCallback(async () => {
    const nextSupplierName = supplierNameDraft.trim();

    if (!nextSupplierName) {
      setNotice({
        type: "error",
        message: "Supplier name is required.",
      });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          supplierName: nextSupplierName,
          contactEmail: draft.contactEmail,
          contactPhone: draft.contactPhone,
          whatsappNumber: draft.whatsappNumber,
          preferredContactMethod: draft.preferredContactMethod || null,
          workflowStage: draft.workflowStage || null,
          notes: draft.notes,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        supplier?: SupplierDirectoryEntry;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to create supplier.");
      }

      if (payload.supplier) {
        setSuppliers((current) => {
          const withoutExisting = current.filter(
            (supplier) =>
              supplier.normalizedSupplierName !== payload.supplier?.normalizedSupplierName,
          );
          return [payload.supplier as SupplierDirectoryEntry, ...withoutExisting];
        });
        setSupplierOptions((current) =>
          buildSupplierSuggestionOptions([
            payload.supplier?.supplierName ?? nextSupplierName,
            ...current,
          ]),
        );
        setSelectedSupplierName(payload.supplier.supplierName);
        setSupplierNameDraft(payload.supplier.supplierName);
        setIsEditingSupplierName(false);
        setDraftFromSupplier(payload.supplier);
      }

      setNotice({
        type: "success",
        message: `Created supplier ${nextSupplierName}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create supplier.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [draft, setDraftFromSupplier, supplierNameDraft]);

  const handleDelete = useCallback(async () => {
    const nextSupplierName = supplierNameDraft.trim();

    if (!selectedSupplier || !nextSupplierName) {
      setNotice({
        type: "error",
        message: "Select a supplier before deleting it.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete supplier ${selectedSupplier.supplierName}? This will remove the supplier from the directory and clear the linked supplier name from matching tickets.`,
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch("/api/admin/suppliers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          supplierName: nextSupplierName,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete supplier.");
      }

      setSuppliers((current) =>
        current.filter((supplier) => supplier.normalizedSupplierName !== normalizeSelectionKey(nextSupplierName)),
      );
      setSupplierOptions((current) =>
        buildSupplierSuggestionOptions(
          current.filter(
            (option) => normalizeSelectionKey(option) !== normalizeSelectionKey(nextSupplierName),
          ),
        ),
      );
      setSelectedSupplierName("");
      setSupplierNameDraft("");
      setIsEditingSupplierName(false);
      setDraft(DEFAULT_DRAFT);
      setNotice({
        type: "success",
        message: `Deleted supplier ${nextSupplierName}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to delete supplier.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedSupplier, supplierNameDraft]);

  const handleCopyBrief = useCallback(async () => {
    if (!selectedSupplier) {
      return;
    }

    try {
      const text = buildSupplierBriefText(selectedSupplier, selectedSupplier.recentOrders[0] ?? null);
      await navigator.clipboard.writeText(text);
      setNotice({
        type: "success",
        message: `Copied brief for ${selectedSupplier.supplierName}.`,
      });
    } catch {
      setNotice({
        type: "error",
        message: "Unable to copy the brief in this browser.",
      });
    }
  }, [selectedSupplier]);

  const handleOpenEmail = useCallback(() => {
    if (!selectedSupplier) {
      return;
    }

    const href = buildSupplierMailtoHref(selectedSupplier, selectedSupplier.recentOrders[0] ?? null);

    if (!href) {
      setNotice({
        type: "error",
        message: "This supplier does not have an email address yet.",
      });
      return;
    }

    window.location.href = href;
  }, [selectedSupplier]);

  const handleOpenWhatsApp = useCallback(() => {
    if (!selectedSupplier) {
      return;
    }

    const href = buildSupplierWhatsAppHref(selectedSupplier, selectedSupplier.recentOrders[0] ?? null);

    if (!href) {
      setNotice({
        type: "error",
        message: "This supplier does not have a phone number yet.",
      });
      return;
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }, [selectedSupplier]);

  const handlePrintBrief = useCallback(() => {
    if (!selectedSupplier) {
      return;
    }

    const briefText = buildSupplierBriefText(selectedSupplier, selectedSupplier.recentOrders[0] ?? null);
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=900");

    if (!printWindow) {
      setNotice({
        type: "error",
        message: "Unable to open a print window.",
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${escapeHtml(selectedSupplier.supplierName)} supplier brief</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 32px;
              color: #0f172a;
            }
            pre {
              white-space: pre-wrap;
              line-height: 1.5;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(selectedSupplier.supplierName)} supplier brief</h1>
          <pre>${escapeHtml(briefText)}</pre>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>`);
    printWindow.document.close();
  }, [selectedSupplier]);

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Supplier Directory
            </p>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Search supplier names as you type, keep contact email and phone numbers on the account,
              and generate supplier follow-up briefs from the admin-only workflow view.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSuppliers()}
              disabled={isLoading}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh Suppliers"}
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
          Last synced {generatedAt ? new Date(generatedAt).toLocaleString("en-GB") : "just now"}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SupplierMetricCard
            label="Suppliers"
            value={String(suppliers.length)}
            helper="Distinct supplier accounts captured from orders and contacts."
          />
          <SupplierMetricCard
            label="Orders"
            value={String(suppliers.reduce((sum, supplier) => sum + supplier.orderCount, 0))}
            helper="Tracked ORDERED, READY, and completed records."
          />
          <SupplierMetricCard
            label="Total Spend"
            value={formatOrderAmount(suppliers.reduce((sum, supplier) => sum + supplier.totalSpend, 0))}
            helper="Combined spend across all tracked supplier records."
          />
          <SupplierMetricCard
            label="With Contact Info"
            value={String(suppliers.filter((supplier) => supplier.contactEmail || supplier.contactPhone).length)}
            helper="Suppliers with at least one saved contact method."
          />
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {notice ? (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            notice.type === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      {!contactsConfigured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supplier contacts are not configured yet. Apply <code>docs/supplier-directory-schema.sql</code> to save email and phone numbers.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Supplier Search
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Start typing to filter suppliers, then select one to review spend, orders, and contacts.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:max-w-md">
              <input
                list="supplier-options"
                value={searchTerm}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchTerm(value);
                  const matchedSupplier = suppliers.find(
                    (supplier) =>
                      supplier.supplierName.toLowerCase() === value.trim().toLowerCase(),
                  );

                  if (matchedSupplier) {
                    setSelectedSupplierName(matchedSupplier.supplierName);
                  }
                }}
                placeholder="Type supplier name, email, or phone"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              />
              <datalist id="supplier-options">
                {supplierSuggestions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <th className="pb-3 pr-4">Supplier</th>
                  <th className="pb-3 pr-4">Orders</th>
                  <th className="pb-3 pr-4">Spend</th>
                  <th className="pb-3 pr-4">Month</th>
                  <th className="pb-3 pr-4">Contacts</th>
                  <th className="pb-3">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-slate-500">
                      Loading supplier directory...
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-slate-500">
                      No suppliers match your search.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <tr
                      key={supplier.normalizedSupplierName}
                      className={`cursor-pointer align-top transition hover:bg-slate-50 ${
                        selectedSupplier?.normalizedSupplierName === supplier.normalizedSupplierName
                          ? "bg-slate-50"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedSupplierName(supplier.supplierName);
                        setDraftFromSupplier(supplier);
                      }}
                    >
                      <td className="py-4 pr-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-slate-900">{supplier.supplierName}</span>
                          {isLikelyInvalidSupplierName(supplier.supplierName) ? (
                            <span className="inline-flex w-fit rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                              Review
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">{supplier.orderCount}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatOrderAmount(supplier.totalSpend)}</td>
                      <td className="py-4 pr-4 text-slate-700">
                        <div className="flex flex-col gap-1">
                          <span>{formatOrderAmount(supplier.currentMonthSpend)}</span>
                          <span className="text-xs text-slate-500">
                            {supplier.currentMonthOrderCount} order{supplier.currentMonthOrderCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">
                        <div className="flex flex-col gap-1 text-xs">
                          <span>{supplier.contactEmail ?? supplier.latestTicketSupplierEmail ?? "-"}</span>
                          <span>{supplier.whatsappNumber ?? supplier.contactPhone ?? "-"}</span>
                        </div>
                      </td>
                      <td className="py-4 text-slate-700">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {supplier.workflowStage}
                          </span>
                          <span>{formatOperationalDate(supplier.lastOrderedAt)}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          {selectedSupplier ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Supplier Account
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block flex-1 space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Supplier Name
                        </span>
                        <input
                          value={supplierNameDraft}
                          readOnly={!isEditingSupplierName}
                          onChange={(event) => setSupplierNameDraft(event.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-base font-semibold text-slate-900 outline-none transition ${
                            isEditingSupplierName
                              ? "border-slate-300 bg-slate-50 focus:border-slate-400"
                              : "cursor-default border-slate-200 bg-slate-100"
                          }`}
                          placeholder="Enter supplier name"
                        />
                      </label>
                      {isEditingSupplierName ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingSupplierName(false)}
                          className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          Done
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditingSupplierName(true)}
                          className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          Edit Name
                        </button>
                      )}
                    </div>
                    {mergeSuggestionName ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold">Possible merge target</p>
                            <p className="mt-1 text-sm text-amber-800">
                              {mergeSuggestionName} looks like the closest existing supplier.
                              Saving with this name will merge the records and remove duplicates.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSupplierNameDraft(mergeSuggestionName);
                              setIsEditingSupplierName(true);
                            }}
                            className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
                          >
                            Use Merge Target
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <p className="text-sm text-slate-500">
                      {selectedSupplier.orderCount} order{selectedSupplier.orderCount === 1 ? "" : "s"} ·{" "}
                      {formatOrderAmount(selectedSupplier.totalSpend)} total spend
                    </p>
                    <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Dispatch: {selectedSupplierDispatchLabel}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSuppliers()}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Reload
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Email
                  </span>
                  <input
                    value={draft.contactEmail}
                    onChange={(event) => setDraft((current) => ({ ...current, contactEmail: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    placeholder="supplier@example.com"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Phone
                  </span>
                  <input
                    value={draft.contactPhone}
                    onChange={(event) => setDraft((current) => ({ ...current, contactPhone: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    placeholder="+44..."
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    WhatsApp
                  </span>
                  <input
                    value={draft.whatsappNumber}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, whatsappNumber: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    placeholder="+44..."
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Preferred Contact
                  </span>
                  <select
                    value={draft.preferredContactMethod}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        preferredContactMethod: event.target.value as SupplierPreferredContactMethod | "",
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                  >
                    <option value="">Manual</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Workflow Stage
                  </span>
                  <select
                    value={draft.workflowStage}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        workflowStage: event.target.value as SupplierWorkflowStage,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="emailed">Emailed</option>
                    <option value="whatsapp_sent">WhatsApp Sent</option>
                    <option value="follow_up">Follow Up</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Last Contacted
                  </span>
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {formatOperationalDate(selectedSupplier.lastContactedAt)}
                  </div>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Notes
                </span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  rows={4}
                  className="aurora-textarea min-h-[8rem]"
                  placeholder="Supplier account notes, call outcomes, lead times, or preferred ordering details."
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="rounded-xl border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save Supplier"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={isSaving || supplierNameDraft.trim().length === 0}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Creating..." : "Create Supplier"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isSaving}
                  className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Deleting..." : "Delete Supplier"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyBrief()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Copy Text Brief
                </button>
                <button
                  type="button"
                  onClick={handleOpenEmail}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Open Email
                </button>
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Open WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handlePrintBrief}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Print / PDF
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Text Brief
                </p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {buildSupplierBriefText(selectedSupplier, selectedSupplier.recentOrders[0] ?? null)}
                </pre>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Monthly Trend
                  </p>
                  <div className="mt-4 space-y-3">
                    {selectedSupplier.monthlyTrend.length === 0 ? (
                      <p className="text-sm text-slate-500">No historical monthly snapshot is available yet.</p>
                    ) : (
                      selectedSupplier.monthlyTrend.slice(0, 6).map((row) => (
                        <div key={row.month_start}>
                          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            <span>{row.month_start}</span>
                            <span>{row.order_count} orders · {formatOrderAmount(row.total_spend)}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-950"
                              style={{
                                width: `${Math.max(
                                  8,
                                  (row.total_spend /
                                    Math.max(
                                      1,
                                      selectedSupplier.monthlyTrend[0]?.total_spend ?? 1,
                                    )) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Recent Orders
                  </p>
                  <div className="mt-4 space-y-3">
                    {selectedSupplier.recentOrders.length === 0 ? (
                      <p className="text-sm text-slate-500">No recent tracked orders for this supplier.</p>
                    ) : (
                      selectedSupplier.recentOrders.map((order) => (
                        <article key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {order.job_number ? `Job ${order.job_number}` : order.purchase_order_number ?? order.id.slice(0, 8)}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                {formatOperationalDate(order.ordered_at)} · {order.status ?? "-"}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">
                              {formatOrderAmount(order.order_amount)}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {order.request_summary ?? order.request_details ?? "No request summary provided."}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              <div>Select a supplier to review account details, spending trends, and follow-up workflow.</div>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  New Supplier Name
                </span>
                <input
                  value={supplierNameDraft}
                  onChange={(event) => setSupplierNameDraft(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                  placeholder="Type a supplier name to create"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={isSaving || supplierNameDraft.trim().length === 0}
                  className="rounded-xl border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Creating..." : "Create Supplier"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function SupplierMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSelectionKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findClosestSupplierName(
  sourceName: string,
  suppliers: SupplierDirectoryEntry[],
  currentSupplierKey: string,
) {
  const sourceKey = normalizeSelectionKey(sourceName);

  if (!sourceKey) {
    return null;
  }

  let bestMatch: { name: string; score: number } | null = null;

  for (const supplier of suppliers) {
    if (supplier.normalizedSupplierName === currentSupplierKey) {
      continue;
    }

    const candidateKey = supplier.normalizedSupplierName;
    const score = scoreSupplierNameMatch(sourceKey, candidateKey);

    if (score <= 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        name: supplier.supplierName,
        score,
      };
    }
  }

  return bestMatch && bestMatch.score >= 0.35 ? bestMatch.name : null;
}

function scoreSupplierNameMatch(leftKey: string, rightKey: string) {
  if (!leftKey || !rightKey) {
    return 0;
  }

  if (leftKey === rightKey) {
    return 1;
  }

  const leftTokens = leftKey.split(" ").filter(Boolean);
  const rightTokens = rightKey.split(" ").filter(Boolean);
  const sharedTokens = new Set(leftTokens.filter((token) => rightTokens.includes(token)));
  const tokenScore = sharedTokens.size / Math.max(leftTokens.length, rightTokens.length, 1);

  const includesScore =
    leftKey.includes(rightKey) || rightKey.includes(leftKey)
      ? Math.min(leftKey.length, rightKey.length) / Math.max(leftKey.length, rightKey.length)
      : 0;

  const distanceScore = 1 - levenshteinDistance(leftKey, rightKey) / Math.max(leftKey.length, rightKey.length, 1);

  return Math.max(tokenScore, includesScore, distanceScore);
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const rows = Array.from({ length: left.length + 1 }, (_, rowIndex) =>
    Array.from({ length: right.length + 1 }, (_, columnIndex) =>
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0,
    ),
  );

  for (let rowIndex = 1; rowIndex <= left.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= right.length; columnIndex += 1) {
      const cost = left[rowIndex - 1] === right[columnIndex - 1] ? 0 : 1;
      rows[rowIndex][columnIndex] = Math.min(
        rows[rowIndex - 1][columnIndex] + 1,
        rows[rowIndex][columnIndex - 1] + 1,
        rows[rowIndex - 1][columnIndex - 1] + cost,
      );
    }
  }

  return rows[left.length][right.length];
}
