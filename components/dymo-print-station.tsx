"use client";

import { useEffect, useRef } from "react";
import {
  buildDymoJobLabelXml,
  normalizeDymoPrinters,
  selectDymoLabelWriter,
  type DymoPrinter,
} from "@/lib/dymo-label";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type DymoFramework = {
  init: (callback?: () => void) => void;
  getPrintersAsync: () => Promise<unknown>;
  openLabelXml: (labelXml: string) => {
    isValidLabel: () => boolean;
    getLabelXml?: () => string;
  };
  is550PrinterAsync?: (printerName: string) => Promise<boolean>;
  getConsumableInfoIn550PrinterAsync?: (printerName: string) => Promise<{
    name?: string;
  }>;
  createLabelWriterPrintParamsXml?: (params: {
    copies: number;
    jobTitle: string;
    printQuality: string;
  }) => string;
  printLabelAsync: (
    printerName: string,
    printParamsXml: string,
    labelXml: string,
    labelSetXml: string,
  ) => Promise<unknown>;
};

type DymoWindow = Window & {
  dymo?: {
    label?: {
      framework?: DymoFramework;
    };
  };
};

type PrintStation = {
  user_id: string;
  printer_name: string | null;
  enabled: boolean;
  auto_print: boolean;
  transport?: "dymo_connect" | "cups";
};

type LabelPrintJob = {
  id: string;
  job_number: string;
  label_token: string;
  requested_by: string | null;
  ready_at: string;
  part_number: string | null;
  part_description: string | null;
  unit_index: number;
  unit_total: number;
  bin_location: string;
};

const DYMO_SCRIPT_ID = "relay-dymo-connect-framework";
const DYMO_SCRIPT_PATH = "/vendor/dymo/dymo.connect.framework.js";
const QUEUE_RECONCILE_INTERVAL_MS = 15_000;

let dymoFrameworkPromise: Promise<DymoFramework> | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function loadDymoFramework() {
  const existingFramework = (window as DymoWindow).dymo?.label?.framework;
  if (existingFramework) {
    return Promise.resolve(existingFramework);
  }

  if (dymoFrameworkPromise) {
    return dymoFrameworkPromise;
  }

  dymoFrameworkPromise = new Promise<DymoFramework>((resolve, reject) => {
    const finishLoading = () => {
      const framework = (window as DymoWindow).dymo?.label?.framework;
      if (!framework) {
        reject(new Error("DYMO Connect framework did not load."));
        return;
      }

      let completed = false;
      const finishInitialization = () => {
        if (completed) return;
        completed = true;
        resolve(framework);
      };

      try {
        framework.init(finishInitialization);
        window.setTimeout(finishInitialization, 1_500);
      } catch (error) {
        reject(error);
      }
    };

    const existingScript = document.getElementById(DYMO_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", finishLoading, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load DYMO Connect support.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = DYMO_SCRIPT_ID;
    script.src = DYMO_SCRIPT_PATH;
    script.async = true;
    script.addEventListener("load", finishLoading, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load DYMO Connect support.")), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    dymoFrameworkPromise = null;
    throw error;
  });

  return dymoFrameworkPromise;
}

async function getAvailablePrinter(
  framework: DymoFramework,
  configuredPrinterName: string | null,
): Promise<DymoPrinter> {
  const printers = normalizeDymoPrinters(await framework.getPrintersAsync());
  const printer = selectDymoLabelWriter(printers, configuredPrinterName);
  if (!printer) {
    throw new Error("No connected DYMO LabelWriter was found. Check DYMO Connect and the USB cable.");
  }
  return printer;
}

export function DymoPrintStation() {
  const processingRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let disposed = false;
    let intervalId: number | null = null;
    let station: PrintStation | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let starting = false;
    const sessionId = crypto.randomUUID();

    const stopActiveStation = () => {
      station = null;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };

    const updateStationHealth = async (values: {
      printer_name?: string;
      last_error?: string | null;
      checkedPrinter?: boolean;
    }) => {
      if (!station || disposed) return;

      const patch: Record<string, string | null> = {
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if ("last_error" in values) patch.last_error = values.last_error ?? null;
      if (values.printer_name) patch.printer_name = values.printer_name;
      if (values.checkedPrinter) patch.last_printer_check_at = new Date().toISOString();

      await supabase
        .from("label_print_stations")
        .update(patch)
        .eq("user_id", station.user_id);
    };

    const failJob = async (jobId: string, error: unknown) => {
      const errorMessage = getErrorMessage(error);
      await supabase.rpc("fail_label_print_job", {
        p_job_id: jobId,
        p_session_id: sessionId,
        p_error: errorMessage,
      });
      await updateStationHealth({ last_error: errorMessage, checkedPrinter: true });
      console.error("RELAY automatic DYMO print failed", error);
    };

    const processQueue = async () => {
      if (disposed || !station || processingRef.current) return;
      processingRef.current = true;

      try {
        const { error: failoverError } = await supabase.rpc(
          "route_unhealthy_primary_jobs_to_backup",
        );
        if (failoverError) throw failoverError;

        for (let processed = 0; processed < 10 && !disposed; processed += 1) {
          const { data, error } = await supabase.rpc("claim_next_label_print_job", {
            p_session_id: sessionId,
          });
          if (error) throw error;

          const job = Array.isArray(data) ? data[0] as LabelPrintJob | undefined : undefined;
          if (!job) break;

          try {
            const framework = await loadDymoFramework();
            const printer = await getAvailablePrinter(framework, station.printer_name);
            station = { ...station, printer_name: printer.name };
            await updateStationHealth({
              printer_name: printer.name,
              checkedPrinter: true,
            });

            let consumableName = "Large Address Labels";
            if (
              framework.is550PrinterAsync
              && framework.getConsumableInfoIn550PrinterAsync
              && await framework.is550PrinterAsync(printer.name)
            ) {
              const consumable = await framework.getConsumableInfoIn550PrinterAsync(printer.name);
              if (consumable.name?.trim()) consumableName = consumable.name.trim();
            }

            const labelXml = buildDymoJobLabelXml({
              barcodeValue: job.label_token,
              jobNumber: job.job_number,
              requestedBy: job.requested_by,
              readyAt: job.ready_at,
              partNumber: job.part_number,
              partDescription: job.part_description,
              unitIndex: job.unit_index,
              unitTotal: job.unit_total,
              binLocation: job.bin_location,
            }, consumableName);
            const label = framework.openLabelXml(labelXml);
            if (!label.isValidLabel()) {
              throw new Error("RELAY generated an invalid DYMO label and stopped before printing.");
            }
            const validatedLabelXml = label.getLabelXml?.() ?? labelXml;
            const printParamsXml = framework.createLabelWriterPrintParamsXml?.({
              copies: 1,
              jobTitle: "RELAY job label",
              printQuality: "BarcodeAndGraphics",
            }) ?? "<LabelWriterPrintParams><Copies>1</Copies><JobTitle>RELAY job label</JobTitle><PrintQuality>BarcodeAndGraphics</PrintQuality></LabelWriterPrintParams>";

            await framework.printLabelAsync(
              printer.name,
              printParamsXml,
              validatedLabelXml,
              "",
            );

            const { error: completionError } = await supabase.rpc("complete_label_print_job", {
              p_job_id: job.id,
              p_session_id: sessionId,
              p_printer_name: printer.name,
            });
            if (completionError) throw completionError;

            await updateStationHealth({
              printer_name: printer.name,
              last_error: null,
              checkedPrinter: true,
            });
          } catch (error) {
            await failJob(job.id, error);
            break;
          }
        }
      } catch (error) {
        await updateStationHealth({ last_error: getErrorMessage(error) });
        console.error("RELAY DYMO queue reconciliation failed", error);
      } finally {
        processingRef.current = false;
      }
    };

    const startStation = async () => {
      if (starting || station) return;
      starting = true;

      try {
        const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
        if (disposed || !user || !isAdmin) return;

        const { data, error } = await supabase
          .from("label_print_stations")
          .select("user_id, printer_name, enabled, auto_print, transport")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!data?.enabled || !data.auto_print || data.transport === "cups" || disposed) return;

        station = data as PrintStation;
        channel = supabase
          .channel(`relay-dymo-print-station-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "label_print_jobs",
              filter: `target_user_id=eq.${user.id}`,
            },
            () => {
              void processQueue();
            },
          )
          .subscribe((status, error) => {
            if (status === "SUBSCRIBED") {
              void processQueue();
            } else if (error) {
              console.error("RELAY DYMO Realtime channel degraded", error);
            }
          });

        intervalId = window.setInterval(() => {
          void processQueue();
        }, QUEUE_RECONCILE_INTERVAL_MS);

        await updateStationHealth({});
        void processQueue();
      } catch (error) {
        console.error("Unable to start the RELAY DYMO print station", error);
      } finally {
        starting = false;
      }
    };

    const startStationAfterCurrentAttempt = async () => {
      while (starting && !disposed) {
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      }

      if (!disposed && !station) {
        await startStation();
      }
    };

    void startStation();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        stopActiveStation();
        return;
      }

      if (station?.user_id && station.user_id !== session.user.id) {
        stopActiveStation();
      }

      window.setTimeout(() => {
        // Do not lose SIGNED_IN when the initial anonymous startup attempt is
        // still holding the station lock.
        void startStationAfterCurrentAttempt();
      }, 0);
    });

    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
      stopActiveStation();
    };
  }, []);

  return null;
}
