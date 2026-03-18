import { Suspense } from "react";
import { AnnotateMediaClient } from "./annotate-media-client";

export const dynamic = "force-dynamic";

export default async function AnnotateMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const attachmentId = getSingleValue(params.attachmentId);
  const imageSrc = getSingleValue(params.src);
  const imageName = getSingleValue(params.name) || "ticket-photo";

  return (
    <Suspense fallback={<AnnotateMediaLoadingState />}>
      <AnnotateMediaClient
        attachmentId={attachmentId}
        imageSrc={imageSrc}
        imageName={imageName}
      />
    </Suspense>
  );
}

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function AnnotateMediaLoadingState() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Loading photo annotation workspace...
        </div>
      </div>
    </main>
  );
}
