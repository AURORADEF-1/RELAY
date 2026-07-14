"use client";

import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  buildTakeuchiCatalogKey,
  fetchTakeuchiPartsCatalog,
  normalizeSearchText,
  normalizeTakeuchiModel,
  parseTakeuchiSerialNumber,
  type TakeuchiPartCatalogImportRow,
  type TakeuchiPartCatalogRecord,
} from "@/lib/takeuchi-parts-catalog";
import { getSupabaseClient } from "@/lib/supabase";

const TAKEUCHI_CATALOG_MIGRATION_HINT = "Apply docs/takeuchi-parts-catalog-schema.sql and try again.";
const TAKEUCHI_OPEN_ENDED_SERIAL_MAX = 999999999;

export function TakeuchiPartsCatalogPanel() {
  const [catalog, setCatalog] = useState<TakeuchiPartCatalogRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadCatalog = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setErrorMessage("");

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
        forceFresh: true,
      });

      if (!user || !isAdmin) {
        setCatalog([]);
        setErrorMessage("Admin access is required for the Takeuchi catalogue.");
        return;
      }

      const rows = await fetchTakeuchiPartsCatalog(supabase);
      setCatalog(rows);
    } catch (error) {
      setCatalog([]);
      setErrorMessage(formatTakeuchiCatalogError(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const visibleCatalog = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);

    if (!normalizedSearch) {
      return catalog;
    }

    return catalog.filter((row) =>
      normalizeSearchText(
        [
          row.machine_model,
          row.serial_start,
          row.serial_end,
          row.bom_main_group,
          row.bom_sub_group,
          row.bom_item,
          row.part_number,
          row.part_description,
          row.suggested_part_number,
          row.notes,
        ]
          .filter((value) => value !== null && value !== undefined)
          .join(" "),
      ).includes(normalizedSearch),
    );
  }, [catalog, searchTerm]);

  const metrics = useMemo(() => {
    const models = new Set<string>();
    const groups = new Set<string>();

    for (const row of catalog) {
      if (row.machine_model_normalized.trim()) {
        models.add(row.machine_model_normalized.trim());
      }

      if (row.bom_main_group.trim()) {
        groups.add(row.bom_main_group.trim());
      }
    }

    return {
      total: catalog.length,
      models: models.size,
      mainGroups: groups.size,
    };
  }, [catalog]);

  const handleImportFile = useCallback(async () => {
    if (!selectedFile) {
      setNotice({
        type: "error",
        message: "Choose a Takeuchi Excel file before importing.",
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
      forceFresh: true,
    });

    if (!user || !isAdmin) {
      setNotice({
        type: "error",
        message: "Admin access is required to import the catalogue.",
      });
      return;
    }

    setIsImporting(true);
    setNotice(null);

    try {
      const workbook = XLSX.read(await selectedFile.arrayBuffer(), { type: "array" });
      const parsedRows = parseTakeuchiWorkbook(workbook, selectedFile.name);

      if (parsedRows.length === 0) {
        throw new Error("No importable Takeuchi rows were found in the workbook.");
      }

      const dedupedRows = Array.from(
        new Map(parsedRows.map((row) => [row.catalog_key, row])).values(),
      );

      const { error } = await supabase
        .from("takeuchi_parts_catalog")
        .upsert(dedupedRows, { onConflict: "catalog_key" });

      if (error) {
        throw new Error(error.message);
      }

      setNotice({
        type: "success",
        message: `Imported ${dedupedRows.length} Takeuchi catalogue row${dedupedRows.length === 1 ? "" : "s"}.`,
      });
      setSelectedFile(null);
      await loadCatalog({ silent: true });
    } catch (error) {
      setNotice({
        type: "error",
        message: formatTakeuchiCatalogError(error),
      });
    } finally {
      setIsImporting(false);
    }
  }, [loadCatalog, selectedFile]);

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Takeuchi Catalogue
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Excel import and verified-machine lookup
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Upload the Takeuchi BOM workbook here, then use the same catalogue to suggest parts for verified machines by model and serial range.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCatalog({ silent: true })}
          disabled={isLoading || isRefreshing}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading || isRefreshing ? "Refreshing..." : "Refresh Catalogue"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage.includes("takeuchi_parts_catalog")
            ? TAKEUCHI_CATALOG_MIGRATION_HINT
            : errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <LookupStat label="Catalogue Rows" value={String(metrics.total)} helper="Imported Takeuchi BOM entries" />
        <LookupStat label="Models" value={String(metrics.models)} helper="Machine models covered by the workbook" />
        <LookupStat label="Main Groups" value={String(metrics.mainGroups)} helper="Top-level BOM item groups" />
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_auto]">
        <label className="block text-sm font-medium text-slate-700">
          Excel file
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            The importer reads each sheet, matches the serial range columns, and upserts by a stable catalogue key.
          </span>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void handleImportFile()}
            disabled={!selectedFile || isImporting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? "Importing..." : "Import Workbook"}
          </button>
        </div>
      </div>

      {notice ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Search
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search model, serial range, main group, subgroup, description, or part number"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
          />
        </label>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">Main Group</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Part Number</th>
                <th className="px-4 py-3">Serial Range</th>
                <th className="px-4 py-3">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                    Loading Takeuchi catalogue...
                  </td>
                </tr>
              ) : visibleCatalog.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                    No catalogue rows match the current filter.
                  </td>
                </tr>
              ) : (
                visibleCatalog.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-4 text-sm font-medium text-slate-900">
                      <div>{row.bom_main_group}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {row.bom_item || "No BOM item"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-900">{row.bom_sub_group}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {row.part_description}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-900">
                        {row.suggested_part_number || row.part_number}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {row.notes || "Suggested part"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-900">
                        {row.serial_start} - {row.serial_end}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {row.source_sheet || row.source_file_name || "Imported workbook"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-900">{row.machine_model}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {row.machine_make}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function LookupStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </article>
  );
}

function parseTakeuchiWorkbook(workbook: XLSX.WorkBook, sourceFileName: string): TakeuchiPartCatalogImportRow[] {
  const rows: TakeuchiPartCatalogImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Array<
      Array<string | number | boolean | null | undefined>
    >;

    if (rawRows.length < 2) {
      continue;
    }

    const headers = rawRows[0].map((cell) => String(cell ?? ""));
    const mappedHeaders = headers.map((header) => normalizeHeader(header));

    for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
      const row = rawRows[rowIndex];
      const parsed = parseTakeuchiSheetRow({
        row,
        rowIndex,
        headers: mappedHeaders,
        sheetName,
        sourceFileName,
      });

      if (parsed) {
        rows.push(parsed);
      }
    }
  }

  return rows;
}

function parseTakeuchiSheetRow({
  row,
  rowIndex,
  headers,
  sheetName,
  sourceFileName,
}: {
  row: Array<string | number | boolean | null | undefined>;
  rowIndex: number;
  headers: string[];
  sheetName: string;
  sourceFileName: string;
}): TakeuchiPartCatalogImportRow | null {
  const getCell = (headerName: string) => {
    const index = headers.findIndex((header) => header === normalizeHeader(headerName));
    return index < 0 ? "" : String(row[index] ?? "").trim();
  };

  const bookName = getCell("Book Name");
  const bomMainGroup = getCell("BOM Item") || sheetName.trim();
  const bomItem = getCell("Item") || null;
  const partNumber = getCell("Part Number");
  const partDescription = getCell("Description");
  const notes = getCell("Remarks") || null;
  const serialNumber = getCell("Serial Number");

  const bookInfo = parseTakeuchiBookName(bookName);
  const machineModel = bookInfo?.machineModel || sheetName.trim();
  const serialStart = bookInfo?.serialStart ?? parseTakeuchiSerialBounds(serialNumber)?.start ?? null;
  const serialEnd =
    bookInfo?.serialEnd ??
    parseTakeuchiSerialBounds(serialNumber)?.end ??
    serialStart;

  if (
    !bookName ||
    !partNumber ||
    !partDescription ||
    serialStart === null ||
    serialEnd === null ||
    isTakeuchiPlaceholderRow(partNumber, partDescription)
  ) {
    return null;
  }

  const normalizedModel = normalizeTakeuchiModel(machineModel || sheetName || "Takeuchi");
  const resolvedMainGroup = bomMainGroup || sheetName.trim() || "Takeuchi";
  const resolvedSerialEnd = serialEnd < serialStart ? serialStart : serialEnd;

  return {
    catalog_key: buildTakeuchiCatalogKey({
      machineModel: machineModel || sheetName || "Takeuchi",
      serialStart,
      serialEnd: resolvedSerialEnd,
      bomMainGroup: resolvedMainGroup,
      bomSubGroup: partDescription,
      bomItem,
      partNumber,
      partDescription,
    }),
    machine_make: "Takeuchi",
    machine_model: machineModel || sheetName || "Takeuchi",
    machine_model_normalized: normalizedModel,
    serial_start: serialStart,
    serial_end: resolvedSerialEnd,
    bom_main_group: resolvedMainGroup,
    bom_sub_group: partDescription,
    bom_item: bomItem,
    part_number: partNumber,
    part_description: partDescription,
    suggested_part_number: partNumber,
    notes,
    source_file_name: sourceFileName,
    source_sheet: sheetName,
    source_row: rowIndex + 1,
  };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseTakeuchiBookName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const machineModel = trimmed.split(/\s+/)[0] || "";
  const serialMatch = trimmed.match(/SN\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/i);
  const openEndedMatch = trimmed.match(/SN\s*(\d+)\s*[-–—]\s*$/i);
  const serialStartValue = serialMatch?.[1] ?? openEndedMatch?.[1] ?? null;
  const serialStart = serialStartValue ? Number.parseInt(serialStartValue, 10) : null;
  const serialEnd = serialMatch?.[2]
    ? Number.parseInt(serialMatch[2], 10)
    : openEndedMatch
      ? TAKEUCHI_OPEN_ENDED_SERIAL_MAX
      : serialStart;

  const bomGroupMatch = trimmed.match(/\[\s*([^\]]+)\s*\]/);

  return {
    machineModel,
    serialStart,
    serialEnd,
    bomGroup: bomGroupMatch?.[1]?.trim() || "",
  };
}

function isTakeuchiPlaceholderRow(partNumber: string, partDescription: string) {
  return /\*{3,}/.test(partNumber) || /not for sale/i.test(partDescription);
}

function parseTakeuchiSerialBounds(value: string) {
  const normalized = value.trim().replace(/[, ]+/g, "");
  if (!normalized) {
    return null;
  }

  const openEndedMatch = normalized.match(/^SN?(\d+)[\-–—]$/i);
  if (openEndedMatch) {
    const serial = Number.parseInt(openEndedMatch[1], 10);
    return {
      start: serial,
      end: TAKEUCHI_OPEN_ENDED_SERIAL_MAX,
    };
  }

  const rangeMatch = normalized.match(/^(\d+)[\-–—](\d+)$/);
  if (rangeMatch) {
    return {
      start: Number.parseInt(rangeMatch[1], 10),
      end: Number.parseInt(rangeMatch[2], 10),
    };
  }

  const toMatch = normalized.match(/^(\d+)(?:to|through|thru)(\d+)$/i);
  if (toMatch) {
    return {
      start: Number.parseInt(toMatch[1], 10),
      end: Number.parseInt(toMatch[2], 10),
    };
  }

  const serial = parseTakeuchiSerialNumber(normalized);
  if (serial === null) {
    return null;
  }

  return {
    start: serial,
    end: serial,
  };
}

function formatTakeuchiCatalogError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to load the Takeuchi catalogue.";

  if (message.toLowerCase().includes("takeuchi_parts_catalog")) {
    return message;
  }

  return message;
}
