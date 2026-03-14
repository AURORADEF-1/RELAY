"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminOnlyLink } from "@/components/admin-only-link";
import { AuthGuard } from "@/components/auth-guard";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { LogoutButton } from "@/components/logout-button";
import { uploadTicketAttachments } from "@/lib/relay-ticketing";
import { getSupabaseClient } from "@/lib/supabase";

type FormValues = {
  requesterName: string;
  department: string;
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
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queuedPhotos, setQueuedPhotos] = useState<File[]>([]);

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
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("Sign in to submit a ticket.");
      setIsSubmitting(false);
      return;
    }

    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        user_id: user.id,
        requester_name: values.requesterName,
        department: values.department,
        machine_reference: values.machineReference,
        job_number: values.jobNumber,
        request_details: values.requestDetails,
        request_summary: values.requestDetails,
        status: "PENDING",
      })
      .select("id")
      .single();

    if (insertError) {
      setErrorMessage(insertError.message);
      setIsSubmitting(false);
      return;
    }

    await supabase.from("ticket_updates").insert({
      ticket_id: ticket.id,
      status: "PENDING",
      comment: "Ticket created.",
    });

    if (queuedPhotos.length > 0) {
      try {
        await uploadTicketAttachments({
          supabase,
          ticketId: ticket.id,
          userId: user.id,
          files: queuedPhotos,
          attachmentKind: "ticket",
        });
      } catch (attachmentError) {
        setErrorMessage(
          attachmentError instanceof Error
            ? `Ticket created, but photo upload failed: ${attachmentError.message}`
            : "Ticket created, but photo upload failed.",
        );
      }
    }

    setSuccessMessage(
      "Ticket submitted successfully. Status is now PENDING.",
    );
    setValues(initialValues);
    setErrors({});
    setQueuedPhotos([]);
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
            </Link>
            <AdminOnlyLink
              href="/admin"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Admin
            </AdminOnlyLink>
            <Link
              href="/login"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Login
            </Link>
          </div>
          <LogoutButton />
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                RELAY
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Parts Request
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Use this form to request parts from Stores. Provide accurate
                information so the request can be processed quickly.
              </p>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm font-semibold text-slate-700">
                  How to Submit a Request
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  Before submitting a request include:
                  <br />
                  <br />
                  • Your name
                  <br />
                  • Department or job location
                  <br />
                  • Machine reference (plant number or model)
                  <br />
                  • Job number
                  <br />
                  • Clear description of the parts required
                  <br />
                  <br />
                  Incomplete requests may delay processing.
                  <br />
                  <br />
                  All requests are logged in RELAY and assigned a status by
                  Stores.
                </p>
                <p className="mt-4 text-sm font-semibold leading-7 text-amber-800">
                  ⚠️ No Job Number = No Parts Issued
                </p>
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
              className="space-y-6 rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Requester name"
                  name="requesterName"
                  value={values.requesterName}
                  error={errors.requesterName}
                  onChange={handleChange}
                />
                <FormField
                  label="Department"
                  name="department"
                  value={values.department}
                  error={errors.department}
                  onChange={handleChange}
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

              {errorMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
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
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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
