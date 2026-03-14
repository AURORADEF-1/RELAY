"use client";

import { useEffect, useState } from "react";

type FileUploadPanelProps = {
  label: string;
  helperText: string;
  inputId: string;
  multiple?: boolean;
  buttonLabel?: string;
  emptyText?: string;
  onFilesChange?: (files: File[]) => void;
};

type FilePreview = {
  file: File;
  previewUrl: string | null;
};

export function FileUploadPanel({
  label,
  helperText,
  inputId,
  multiple = true,
  buttonLabel = "Select images",
  emptyText = "No files selected yet.",
  onFilesChange,
}: FileUploadPanelProps) {
  const [items, setItems] = useState<FilePreview[]>([]);

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

    setItems((current) => {
      current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });

      return nextFiles.map((file) => ({
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));
    });

    onFilesChange?.(nextFiles);
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
