import Link from "next/link";

type TicketAttachmentGalleryProps = {
  attachments: Array<{
    id: string;
    name: string;
    url?: string | null;
    caption?: string;
  }>;
  title?: string;
  helperText?: string;
  allowDownload?: boolean;
};

export function TicketAttachmentGallery({
  attachments,
  title = "Attachments",
  helperText = "Photos and diagrams linked to this request.",
  allowDownload = false,
}: TicketAttachmentGalleryProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
        <p className="text-sm leading-6 text-slate-500">{helperText}</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {attachments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            No images linked to this ticket yet.
          </div>
        ) : (
          attachments.map((attachment) => (
            <article
              key={attachment.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              {attachment.url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="h-44 w-full object-cover"
                  />
                </>
              ) : (
                <div className="flex h-44 items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-500">
                  Preview unavailable for this attachment.
                </div>
              )}
              <div className="space-y-1 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {attachment.name}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {attachment.caption ?? "Uploaded reference image"}
                </p>
                {attachment.url ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Open in New Window
                    </a>
                    <Link
                      href={`/media/annotate?attachmentId=${encodeURIComponent(attachment.id)}&src=${encodeURIComponent(attachment.url)}&name=${encodeURIComponent(attachment.name)}`}
                      target="_blank"
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Edit / Draw
                    </Link>
                    {allowDownload ? (
                      <a
                        href={attachment.url}
                        download={attachment.name}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Download
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
