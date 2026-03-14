"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSuccessMessage("");
      return;
    }

    setSuccessMessage(
      "Request captured locally. Status will start as PENDING once backend handling is added.",
    );
    setValues(initialValues);
    setErrors({});
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
          <Link href="/" className="rounded-full px-3 py-1 hover:bg-white">
            Home
          </Link>
          <Link
            href="/requests"
            className="rounded-full px-3 py-1 hover:bg-white"
          >
            My Requests
          </Link>
          <Link href="/admin" className="rounded-full px-3 py-1 hover:bg-white">
            Admin
          </Link>
        </nav>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                RELAY
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Ticket Submission
              </h1>
              <p className="text-sm leading-7 text-slate-600 sm:text-base">
                Submit an MLP parts request with the basic information needed to
                start triage. New requests will default to{" "}
                <span className="font-semibold text-amber-700">PENDING</span>{" "}
                when backend handling is connected.
              </p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">
                  Submission notes
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  This form currently validates in the browser only. No data is
                  persisted yet.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-6"
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

              {successMessage ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {successMessage}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">All fields are required.</p>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </section>
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
    <label className="block text-sm font-medium text-slate-700">
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
