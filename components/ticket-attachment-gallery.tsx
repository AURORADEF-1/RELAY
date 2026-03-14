type TicketAttachmentGalleryProps = {
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    caption?: string;
  }>;
  title?: string;
  helperText?: string;
};

export function TicketAttachmentGallery({
  attachments,
  title = "Attachments",
  helperText = "Photos and diagrams linked to this request.",
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt={attachment.name}
                className="h-44 w-full object-cover"
              />
              <div className="space-y-1 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {attachment.name}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {attachment.caption ?? "Uploaded reference image"}
                </p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
