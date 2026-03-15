"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { triggerActionFeedback } from "@/lib/action-feedback";
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
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
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

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      setValues(initialValues);
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link
                  href="/control"
                  className="rounded-full px-4 py-2 hover:bg-white"
                >
                  Workshop Control
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Workshop Request Intake
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Parts Request
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Use this form to request parts from Stores. Provide accurate
                information so the request can be processed quickly.
              </p>
              <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-4">
                <button
                  type="button"
                  onClick={() => setIsHelpOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      How to Submit a Request
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Keep this compact guide nearby while completing the form.
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {isHelpOpen ? "Hide" : "Show"}
                  </span>
                </button>
                {isHelpOpen ? (
                  <>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      Before submitting include your name, location, machine reference, job number, and a clear description of the parts required.
                    </p>
                    <p className="mt-3 text-sm font-semibold leading-7 text-amber-800">
                      ⚠️ No Job Number = No Parts Issued
                    </p>
                  </>
                ) : null}
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Photo support
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    You can also attach photos of the damaged part, machine
                    area, or identification plate. Images are linked to the
                    request so Stores can identify the issue faster.
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="space-y-6 rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Requester name"
                  name="requesterName"
                  value={values.requesterName}
                  error={errors.requesterName}
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
                  onChange={handleChange}
                />
                <FormField
                  label="Job number"
                  name="jobNumber"
                  value={values.jobNumber}
                  error={errors.jobNumber}
                  onChange={handleChange}
                />
              </div>

              <FormField
                label="Request details"
                name="requestDetails"
                value={values.requestDetails}
                error={errors.requestDetails}
                onChange={handleChange}
                multiline
              />

              <FileUploadPanel
                label="Upload photos"
                helperText="Add one or more photos to help Stores identify the correct part or issue."
                inputId="ticket-photo-upload"
                buttonLabel="Add request photos"
                emptyText="No request photos selected yet."
                onFilesChange={setQueuedPhotos}
              />

              {queuedPhotos.length > 0 ? (
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {queuedPhotos.length} image{queuedPhotos.length > 1 ? "s" : ""} queued for this request
                </p>
              ) : null}

              {values.department === "Onsite" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Onsite location
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Capture your current location and confirm it before submission.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void requestOnsiteLocation()}
                      disabled={isLocating}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLocating ? "Locating..." : "Refresh Location"}
                    </button>
                  </div>

                  {locationStatusMessage ? (
                    <div
                      className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                        locationStatusMessage.type === "error"
                          ? "border border-rose-200 bg-rose-50 text-rose-700"
                          : locationStatusMessage.type === "success"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {locationStatusMessage.message}
                    </div>
                  ) : null}

                  {locationDraft ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-700">
                        Detected location
                      </p>
                      <p className="mt-2 text-sm text-slate-600">{locationDraft.summary}</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setLocationDraft((current) =>
                              current ? { ...current, confirmed: true } : current,
                            )
                          }
                          className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                            locationDraft.confirmed
                              ? "bg-emerald-600 text-white"
                              : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                          }`}
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
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          Ignore Location
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </div>
              ) : null}

              {photoStatusMessage ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    photoStatusMessage.type === "success"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {photoStatusMessage.message}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {successMessage}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">All fields are required.</p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

type FormFieldProps = {
  label: string;
  name: keyof FormValues;
  value: string;
  error?: string;
  multiline?: boolean;
  onChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
};

function FormField({
  label,
  name,
  value,
  error,
  multiline = false,
  onChange,
}: FormFieldProps) {
  const sharedClasses =
    "mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400";
  const classes = `${sharedClasses} ${
    error ? "border-rose-300" : "border-slate-200"
  }`;

  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={5}
          className={classes}
        />
      ) : (
        <input
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          className={classes}
        />
      )}
      {error ? <span className="mt-2 block text-sm text-rose-600">{error}</span> : null}
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
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  options: readonly string[];
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        value={value}
        onChange={onChange}
        className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 ${
          error ? "border-rose-300" : "border-slate-200"
        }`}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </label>
  );
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
    status: "PENDING" as const,
    ...(department === "Onsite" && locationDraft?.confirmed
      ? {
          location_lat: locationDraft.lat,
          location_lng: locationDraft.lng,
          location_summary: locationDraft.summary,
          location_confirmed: true,
        }
      : {}),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
