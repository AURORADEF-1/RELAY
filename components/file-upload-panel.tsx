"use client";

import { useEffect, useState } from "react";
import { getAttachmentValidationError } from "@/lib/relay-ticketing";

type FileUploadPanelProps = {
  label: string;
  helperText: string;
  inputId: string;
  multiple?: boolean;
  maxFiles?: number;
  buttonLabel?: string;
  emptyText?: string;
  onFilesChange?: (files: File[]) => void;
};

type FilePreview = {
  file: File;
  previewUrl: string | null;
  previewNote?: string | null;
};

const MAX_INLINE_PREVIEW_SIZE_BYTES = 4 * 1024 * 1024;

export function FileUploadPanel({
  label,
  helperText,
  inputId,
  multiple = true,
  maxFiles,
  buttonLabel = "Select images",
  emptyText = "No files selected yet.",
  onFilesChange,
}: FileUploadPanelProps) {
  const [items, setItems] = useState<FilePreview[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [items]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    const limitedFiles =
      typeof maxFiles === "number" ? nextFiles.slice(0, maxFiles) : nextFiles;
    const validFiles: File[] = [];
    const validationErrors: string[] = [];

    limitedFiles.forEach((file) => {
      const validationError = getAttachmentValidationError(file);

      if (validationError) {
        validationErrors.push(`${file.name}: ${validationError}`);
        return;
      }

      validFiles.push(file);
    });

    if (typeof maxFiles === "number" && nextFiles.length > maxFiles) {
      validationErrors.unshift(`You can upload up to ${maxFiles} photos at once.`);
    }

    setSelectionError(validationErrors.length > 0 ? validationErrors[0] : null);

    setItems((current) => {
      current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });

      return validFiles.map((file) => ({
        file,
        previewUrl: shouldCreateInlinePreview(file) ? URL.createObjectURL(file) : null,
        previewNote: getPreviewNote(file),
      }));
    });

    onFilesChange?.(validFiles);
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-sm leading-6 text-slate-500">{helperText}</p>
      </div>

      <div className="mt-4">
        <label
          htmlFor={inputId}
          className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          {buttonLabel}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple={multiple}
          onChange={handleFileChange}
          className="sr-only"
        />
      </div>

      {selectionError ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {selectionError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={`${item.file.name}-${item.file.lastModified}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-32 w-full rounded-xl object-cover"
                />
              ) : null}
              <div className="mt-3 space-y-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {item.file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {item.previewNote ? (
                  <p className="text-xs text-slate-500">{item.previewNote}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function shouldCreateInlinePreview(file: File) {
  return (
    file.type.startsWith("image/") &&
    file.size <= MAX_INLINE_PREVIEW_SIZE_BYTES &&
    file.type !== "image/heic" &&
    file.type !== "image/heif"
  );
}

function getPreviewNote(file: File) {
  if (!file.type.startsWith("image/")) {
    return null;
  }

  if (file.type === "image/heic" || file.type === "image/heif") {
    return "Preview skipped to avoid mobile memory issues with HEIC images.";
  }

  if (file.size > MAX_INLINE_PREVIEW_SIZE_BYTES) {
    return "Preview skipped to reduce browser memory usage on large photos.";
  }

  return null;
}
