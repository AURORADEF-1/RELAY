"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { QrMachineReferenceScanner } from "@/components/qr-machine-reference-scanner";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { triggerActionFeedback } from "@/lib/action-feedback";
import { notifyAdminsOfNewTicket } from "@/lib/notifications";
import { fetchCurrentProfileSettings } from "@/lib/profile-settings";
import { uploadTicketAttachments } from "@/lib/relay-ticketing";
import { getSupabaseClient } from "@/lib/supabase";

const departmentOptions = ["Onsite", "Yard"] as const;

type FormValues = {
  requesterName: string;
  department: (typeof departmentOptions)[number] | "";
  machineReference: string;
  jobNumber: string;
  requestDetails: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const initialValues: FormValues = {
  requesterName: "",
  department: "",
  machineReference: "",
  jobNumber: "",
  requestDetails: "",
};

const fieldLabels: Record<keyof FormValues, string> = {
  requesterName: "Requester name",
  department: "Department",
  machineReference: "Machine reference",
  jobNumber: "Job number",
  requestDetails: "Request details",
};

export default function SubmitPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin, taskUnreadCount } = useNotifications();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [photoStatusMessage, setPhotoStatusMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [locationStatusMessage, setLocationStatusMessage] = useState<{
    type: "info" | "error" | "success";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queuedPhotos, setQueuedPhotos] = useState<File[]>([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationDraft, setLocationDraft] = useState<{
    lat: number;
    lng: number;
    summary: string;
    confirmed: boolean;
  } | null>(null);
  const [scannedMachineReference, setScannedMachineReference] = useState("");

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    let isMounted = true;

    async function loadRequesterName() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        return;
      }

      try {
        const profile = await fetchCurrentProfileSettings(supabase, user.id);
        if (!isMounted) {
          return;
        }

        setValues((current) =>
          current.requesterName.trim()
            ? current
            : {
                ...current,
                requesterName: profile.full_name ?? "",
              },
        );
      } catch (error) {
        console.error("Failed to prefill requester name", error);
      }
    }

    void loadRequesterName();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const nextMachineReference =
      new URLSearchParams(window.location.search).get("machineReference")?.trim() || "";

    setScannedMachineReference(nextMachineReference);
  }, []);

  useEffect(() => {
    if (!scannedMachineReference) {
      return;
    }

    setValues((current) =>
      current.machineReference.trim()
        ? current
        : {
            ...current,
            machineReference: scannedMachineReference,
          },
    );
  }, [scannedMachineReference]);

  function handleMachineReferenceDetected(machineReference: string) {
    setScannedMachineReference(machineReference);
    setValues((current) => ({
      ...current,
      machineReference,
    }));
    setErrors((current) => {
      if (!current.machineReference) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors.machineReference;
      return nextErrors;
    });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    const fieldName = name as keyof FormValues;

    setValues((current) => ({
      ...current,
      [fieldName]: value,
    }));

    setErrors((current) => {
      if (!current[fieldName]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[fieldName];
      return nextErrors;
    });

    if (fieldName === "department") {
      const nextDepartment = value as FormValues["department"];

      if (nextDepartment === "Onsite") {
        void requestOnsiteLocation();
      } else {
        setLocationDraft(null);
        setLocationStatusMessage(null);
      }
    }
  }

  async function requestOnsiteLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatusMessage({
        type: "error",
        message: "Location is unavailable on this device. You can still submit the request manually.",
      });
      return;
    }

    setIsLocating(true);
    setLocationStatusMessage({
      type: "info",
      message: "Requesting current location for onsite submission...",
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const summary = `Onsite coordinates ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        setLocationDraft({
          lat,
          lng,
          summary,
          confirmed: false,
        });
        setLocationStatusMessage({
          type: "info",
          message: "Location captured. Please confirm before submission.",
        });
        setIsLocating(false);
      },
      () => {
        setLocationDraft(null);
        setLocationStatusMessage({
          type: "error",
          message: "Location permission was denied or unavailable. You can still submit without location.",
        });
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

    (Object.keys(values) as Array<keyof FormValues>).forEach((key) => {
      if (!values[key].trim()) {
        nextErrors[key] = `${fieldLabels[key]} is required.`;
      }
    });

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setPhotoStatusMessage(null);
    setLocationStatusMessage((current) =>
      current?.type === "success" ? current : current,
    );

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSuccessMessage("");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMessage("Sign in to submit a ticket.");
        return;
      }

      const ticketPayload = buildTicketInsertPayload({
        authenticatedUserId: user.id,
        values,
        locationDraft,
      });

      const { data: ticket, error: insertError } = await supabase
        .from("tickets")
        .insert(ticketPayload)
        .select("id")
        .single();

      if (insertError || !ticket) {
        throw new Error(insertError?.message || "Failed to create ticket.");
      }

      const { error: ticketUpdateError } = await supabase
        .from("ticket_updates")
        .insert({
          ticket_id: ticket.id,
          status: "PENDING",
          comment: "Ticket created.",
        });

      if (ticketUpdateError) {
        setErrorMessage(
          `Ticket ${ticket.id} was created, but the initial status log failed: ${ticketUpdateError.message}`,
        );
      }

      if (queuedPhotos.length > 0) {
        try {
          const uploadedPhotos = await uploadTicketAttachments({
            supabase,
            ticketId: ticket.id,
            userId: user.id,
            files: queuedPhotos,
            attachmentKind: "ticket",
          });

          setPhotoStatusMessage({
            type: "success",
            message: `${uploadedPhotos.length} request photo${
              uploadedPhotos.length === 1 ? "" : "s"
            } uploaded successfully.`,
          });
        } catch (attachmentError) {
          const message =
            attachmentError instanceof Error
              ? attachmentError.message
              : "Ticket created, but photo upload failed.";
          setPhotoStatusMessage({
            type: "error",
            message: `Ticket ${ticket.id} was created, but photo upload failed: ${message}`,
          });
        }
      }

      if (values.department === "Onsite" && locationDraft?.confirmed) {
        setLocationStatusMessage({
          type: "success",
          message: `Location attached: ${locationDraft.summary}`,
        });
      }

      setSuccessMessage(
        `Ticket ${String(ticket.id).slice(0, 8)} submitted successfully. Status is now PENDING.`,
      );
      triggerActionFeedback();
      void notifyAdminsOfNewTicket(supabase, {
        ticketId: ticket.id,
        jobNumber: ticketPayload.job_number,
        requesterName: ticketPayload.requester_name,
        requestSummary: ticketPayload.request_summary,
      }).catch((notificationError) => {
        console.error("Failed to create admin notifications for new ticket", notificationError);
      });
      setValues({
        ...initialValues,
        requesterName: ticketPayload.requester_name,
      });
      setErrors({});
      setQueuedPhotos([]);
      setLocationDraft(null);
    } catch (submitError) {
      setErrorMessage(
        submitError instanceof Error
          ? submitError.message
          : "Failed to submit the request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasQueuedPhotos = queuedPhotos.length > 0;

  return (
    <main className="aurora-shell">
      <div className="aurora-shell-inner max-w-6xl space-y-6">
        <nav className="aurora-nav">
          <RelayLogo />
          <div className="aurora-nav-links text-sm font-medium">
            <Link href="/" className="aurora-link">
              Home
            </Link>
            <Link href="/legal" className="aurora-link">
              Legal
            </Link>
            <Link href="/settings" className="aurora-link">
              Settings
            </Link>
            <Link href="/requests" className="aurora-link">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/tasks" className="aurora-link">
              Tasks
              <NotificationBadge count={taskUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="aurora-link">
                  Workshop Control
                </Link>
                <Link href="/control" className="aurora-link">
                  Admin Control
                </Link>
                <Link href="/admin" className="aurora-link">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          <section className="aurora-section relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7 lg:px-8">
            <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_62%)] opacity-70" />
            <div className="relative space-y-5">
              <header className="space-y-4 border-b border-[color:var(--border)] pb-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <RelayLogo compact className="scale-[0.88] origin-left" />
                      <span className="aurora-kicker">Workshop Intake</span>
                    </div>
                    <div className="space-y-2">
                      <h1 className="aurora-title text-[clamp(2.3rem,6vw,4.35rem)]">
                        Parts Request
                      </h1>
                      <p className="max-w-2xl text-sm leading-6 text-[color:var(--foreground-muted)] sm:text-[0.95rem]">
                        Submit a parts request to Stores with the information needed for fast
                        identification and fulfilment.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] px-4 py-3 text-left sm:max-w-xs">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--foreground-subtle)]">
                      Operational Note
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
                      All request fields remain required. Dark mode is the reference presentation.
                    </p>
                  </div>
                </div>
                {scannedMachineReference ? (
                  <div className="rounded-[1.2rem] border border-[color:var(--success)] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--foreground-strong)]">
                    Machine reference <span className="font-semibold">{scannedMachineReference}</span>{" "}
                    captured from QR and prefilled below.
                  </div>
                ) : null}
              </header>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <section className="aurora-panel rounded-[1.6rem] border-[color:var(--border-strong)] bg-[color:var(--background-panel-strong)] p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                        Machine QR intake
                      </p>
                      <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
                        Scan a machine label to prefill the reference before completing the request.
                      </p>
                    </div>
                    <QrMachineReferenceScanner onDetected={handleMachineReferenceDetected} />
                  </div>
                </section>

                <HelpPanel isOpen={isHelpOpen} onToggle={() => setIsHelpOpen((current) => !current)} />
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <section className="aurora-panel rounded-[1.7rem] border-[color:var(--border-strong)] bg-[color:var(--background-panel-strong)] p-4 sm:p-5">
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label="Requester name"
                        name="requesterName"
                        value={values.requesterName}
                        error={errors.requesterName}
                        placeholder="Full name"
                        onChange={handleChange}
                      />
                      <SelectField
                        label="Department"
                        name="department"
                        value={values.department}
                        error={errors.department}
                        onChange={handleChange}
                        options={departmentOptions}
                      />
                      <FormField
                        label="Machine reference"
                        name="machineReference"
                        value={values.machineReference}
                        error={errors.machineReference}
                        placeholder="Machine reference"
                        onChange={handleChange}
                      />
                      <FormField
                        label="Job number"
                        name="jobNumber"
                        value={values.jobNumber}
                        error={errors.jobNumber}
                        placeholder="Job number"
                        onChange={handleChange}
                      />
                    </div>

                    <FormField
                      label="Request details"
                      name="requestDetails"
                      value={values.requestDetails}
                      error={errors.requestDetails}
                      placeholder="Describe the part required, fault, or identifying detail."
                      onChange={handleChange}
                      multiline
                    />
                  </div>
                </section>

                <FileUploadPanel
                  label="Photo upload"
                  helperText="Attach clear photos of the part, machine area, or identification plate when needed."
                  inputId="ticket-photo-upload"
                  buttonLabel="Add photos"
                  emptyText="No request photos selected."
                  onFilesChange={setQueuedPhotos}
                />

                {hasQueuedPhotos ? (
                  <div className="rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                    {queuedPhotos.length} image{queuedPhotos.length > 1 ? "s" : ""} queued for upload
                  </div>
                ) : null}

                {values.department === "Onsite" ? (
                  <section className="aurora-panel rounded-[1.6rem] p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                          Onsite location
                        </p>
                        <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
                          Capture and confirm your current location before submission.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void requestOnsiteLocation()}
                        disabled={isLocating}
                        className="aurora-button-secondary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLocating ? "Locating..." : "Refresh Location"}
                      </button>
                    </div>

                    {locationStatusMessage ? (
                      <AlertMessage type={locationStatusMessage.type}>
                        {locationStatusMessage.message}
                      </AlertMessage>
                    ) : null}

                    {locationDraft ? (
                      <div className="mt-4 rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--foreground-subtle)]">
                          Detected location
                        </p>
                        <p className="mt-2 text-sm text-[color:var(--foreground)]">
                          {locationDraft.summary}
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() =>
                              setLocationDraft((current) =>
                                current ? { ...current, confirmed: true } : current,
                              )
                            }
                            className={
                              locationDraft.confirmed
                                ? "aurora-button w-full sm:w-auto"
                                : "aurora-button-secondary w-full sm:w-auto"
                            }
                          >
                            {locationDraft.confirmed ? "Location Confirmed" : "Confirm Location"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLocationDraft(null);
                              setLocationStatusMessage({
                                type: "info",
                                message: "Location capture removed. Submission will continue without geotagging.",
                              });
                            }}
                            className="aurora-button-secondary w-full sm:w-auto"
                          >
                            Ignore Location
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {errorMessage ? <AlertMessage type="error">{errorMessage}</AlertMessage> : null}
                {photoStatusMessage ? (
                  <AlertMessage type={photoStatusMessage.type}>{photoStatusMessage.message}</AlertMessage>
                ) : null}
                {successMessage ? <AlertMessage type="success">{successMessage}</AlertMessage> : null}

                <section className="aurora-panel rounded-[1.55rem] border-[color:var(--border-strong)] p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                        Ready to submit
                      </p>
                      <p className="text-sm text-[color:var(--foreground-muted)]">
                        All fields are required. Photos are optional but recommended where they help identification.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="aurora-button min-h-12 w-full rounded-[1rem] px-5 text-[0.82rem] uppercase tracking-[0.18em] sm:w-auto disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </section>
              </form>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

type HelpPanelProps = {
  isOpen: boolean;
  onToggle: () => void;
};

function HelpPanel({ isOpen, onToggle }: HelpPanelProps) {
  const contentId = useId();

  return (
    <section className="aurora-panel rounded-[1.6rem] border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
            Submission guidance
          </p>
          <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
            Compact instructions for fast intake.
          </p>
        </div>
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--foreground-subtle)]">
          {isOpen ? "Hide" : "View"}
        </span>
      </button>

      <div
        id={contentId}
        className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
          isOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-[color:var(--border)] pt-4 text-sm leading-6 text-[color:var(--foreground-muted)]">
            <p>Include the machine reference, job number, and the exact part or failure detail.</p>
            <p>Attach photos only when they improve identification.</p>
            <p className="font-semibold text-[color:var(--warning)]">No job number, no parts issued.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

type FormFieldProps = {
  label: string;
  name: keyof FormValues;
  value: string;
  error?: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
};

function FormField({
  label,
  name,
  value,
  error,
  placeholder,
  multiline = false,
  onChange,
}: FormFieldProps) {
  const classes = `${multiline ? "aurora-textarea" : "aurora-input"} ${
    error
      ? "border-[color:var(--danger)]"
      : "border-[color:var(--border)]"
  } mt-2`;

  return (
    <label className="block text-sm font-semibold tracking-[0.01em] text-[color:var(--foreground-strong)]">
      {label}
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={5}
          placeholder={placeholder}
          className={classes}
        />
      ) : (
        <input
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={classes}
        />
      )}
      {error ? (
        <span className="mt-2 block text-sm text-[color:var(--danger)]">{error}</span>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  error,
  onChange,
  options,
}: {
  label: string;
  name: keyof FormValues;
  value: string;
  error?: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  options: readonly string[];
}) {
  return (
    <label className="block text-sm font-semibold tracking-[0.01em] text-[color:var(--foreground-strong)]">
      {label}
      <select
        name={name}
        value={value}
        onChange={onChange}
        className={`aurora-select mt-2 ${
          error
            ? "border-[color:var(--danger)]"
            : "border-[color:var(--border)]"
        }`}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-sm text-[color:var(--danger)]">{error}</p> : null}
    </label>
  );
}

function AlertMessage({
  type,
  children,
}: {
  type: "success" | "error" | "info";
  children: ReactNode;
}) {
  const toneClass =
    type === "success"
      ? "aurora-alert-success"
      : type === "error"
        ? "aurora-alert-error"
        : "border-[color:var(--border)] bg-[color:var(--background-muted)] text-[color:var(--foreground-muted)]";

  return <div className={`aurora-alert ${toneClass}`}>{children}</div>;
}

function buildTicketInsertPayload(
  {
    authenticatedUserId,
    values,
    locationDraft,
  }: {
    authenticatedUserId: string;
    values: FormValues;
    locationDraft: {
      lat: number;
      lng: number;
      summary: string;
      confirmed: boolean;
    } | null;
  },
) {
  const userId = authenticatedUserId.trim();

  if (!isUuid(userId)) {
    throw new Error("Authenticated user ID is invalid.");
  }

  const requesterName = values.requesterName.trim();
  const department = values.department.trim();
  const machineReference = values.machineReference.trim();
  const jobNumber = values.jobNumber.trim();
  const requestDetails = values.requestDetails.trim();

  return {
    user_id: userId,
    requester_name: requesterName,
    department,
    machine_reference: machineReference,
    job_number: jobNumber,
    request_details: requestDetails,
    request_summary: requestDetails,
    status: "PENDING",
    location_latitude: locationDraft?.confirmed ? locationDraft.lat : null,
    location_longitude: locationDraft?.confirmed ? locationDraft.lng : null,
    location_summary: locationDraft?.confirmed ? locationDraft.summary : null,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
