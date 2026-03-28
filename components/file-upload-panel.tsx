"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
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
const MAX_IMAGE_DIMENSION = 1600;
const OPTIMIZED_UPLOAD_TARGET_BYTES = 1.25 * 1024 * 1024;
const JPEG_WEBP_QUALITY = 0.82;

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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [items]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    const limitedFiles =
      typeof maxFiles === "number" ? nextFiles.slice(0, maxFiles) : nextFiles;
    const validFiles: Array<{ file: File; previewNote?: string | null }> = [];
    const validationErrors: string[] = [];

    setIsProcessing(true);

    for (const file of limitedFiles) {
      const validationError = getAttachmentValidationError(file);

      if (validationError) {
        validationErrors.push(`${file.name}: ${validationError}`);
        continue;
      }

      const optimized = await optimizeImageFile(file);
      validFiles.push(optimized);
    }

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
        file: file.file,
        previewUrl: shouldCreateInlinePreview(file.file) ? URL.createObjectURL(file.file) : null,
        previewNote: file.previewNote ?? getPreviewNote(file.file),
      }));
    });

    onFilesChange?.(validFiles.map((item) => item.file));
    setIsProcessing(false);
  }

  return (
    <div className="aurora-panel rounded-[1.6rem] border-[color:var(--border-strong)] bg-[color:var(--background-panel-strong)] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">{label}</p>
          <p className="max-w-2xl text-sm leading-6 text-[color:var(--foreground-muted)]">
            {helperText}
          </p>
        </div>

        <label
          htmlFor={inputId}
          className="aurora-button-secondary w-full cursor-pointer sm:w-auto"
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
        <p className="aurora-alert mt-4 border-[color:rgba(180,83,9,0.24)] bg-[color:var(--warning-soft)] text-[color:var(--warning)]">
          {selectionError}
        </p>
      ) : null}

      {isProcessing ? (
        <p className="aurora-alert mt-4 border-[color:var(--border)] bg-[color:var(--background-muted)] text-[color:var(--foreground-muted)]">
          Optimising photos for upload...
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-4 rounded-[1.2rem] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--background-muted)] px-4 py-5 text-sm text-[color:var(--foreground-muted)]">
          {emptyText}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={`${item.file.name}-${item.file.lastModified}`}
              className="rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] p-3"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-32 w-full rounded-[0.95rem] object-cover"
                />
              ) : null}
              <div className="mt-3 space-y-1">
                <p className="truncate text-sm font-semibold text-[color:var(--foreground-strong)]">
                  {item.file.name}
                </p>
                <p className="text-xs text-[color:var(--foreground-subtle)]">
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {item.previewNote ? (
                  <p className="text-xs text-[color:var(--foreground-subtle)]">{item.previewNote}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function optimizeImageFile(file: File) {
  if (!shouldOptimizeBeforeUpload(file)) {
    return {
      file,
      previewNote: getPreviewNote(file),
    };
  }

  try {
    const optimizedFile = await resizeAndCompressImage(file);
    const savedBytes = file.size - optimizedFile.size;
    const optimizationNote =
      savedBytes > 32 * 1024
        ? `Optimised automatically for upload (${formatMegabytes(optimizedFile.size)} MB).`
        : getPreviewNote(optimizedFile);

    return {
      file: optimizedFile,
      previewNote: optimizationNote,
    };
  } catch {
    return {
      file,
      previewNote: getPreviewNote(file),
    };
  }
}

function shouldOptimizeBeforeUpload(file: File) {
  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp"
  );
}

async function resizeAndCompressImage(file: File) {
  const image = await loadImage(file);
  const { width, height } = constrainDimensions(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context unavailable.");
  }

  context.drawImage(image, 0, 0, width, height);

  let blob = await canvasToBlob(
    canvas,
    file.type,
    file.type === "image/jpeg" || file.type === "image/webp" ? JPEG_WEBP_QUALITY : undefined,
  );

  if (
    blob.size > OPTIMIZED_UPLOAD_TARGET_BYTES &&
    (file.type === "image/jpeg" || file.type === "image/webp")
  ) {
    blob = await canvasToBlob(canvas, file.type, 0.72);
  }

  if (blob.size >= file.size) {
    return file;
  }

  return new File([blob], file.name, {
    type: blob.type || file.type,
    lastModified: file.lastModified,
  });
}

function constrainDimensions(width: number, height: number) {
  const largestSide = Math.max(width, height);

  if (largestSide <= MAX_IMAGE_DIMENSION) {
    return { width, height };
  }

  const scale = MAX_IMAGE_DIMENSION / largestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image decode failed."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas export failed."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function formatMegabytes(size: number) {
  return (size / 1024 / 1024).toFixed(2);
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
