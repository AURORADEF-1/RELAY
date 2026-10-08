"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsoleShell } from "@/components/console/console-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getCurrentUserWithRole, isEffectiveAdminForPreview } from "@/lib/profile-access";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";
import { getAttachmentValidationError } from "@/lib/relay-ticketing";
import {
  fetchSupportTicketAttachments,
  uploadSupportTicketImages,
} from "@/lib/support-ticket-attachments";
import type { SupportTicket, SupportTicketAttachment, SupportTicketStatus } from "@/lib/support-tickets";

const SUPPORT_TICKET_IMAGES_ENABLED = true;

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<Record<string, SupportTicketAttachment[]>>({});
  const [form, setForm] = useState({ requesterName: "", requesterEmail: "", subject: "", description: "", website: "" });
  const imagePreviews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  useEffect(() => () => imagePreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [imagePreviews]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) { setLoading(false); return; }
    const session = await getCurrentUserWithRole(supabase);
    const previewAccessGroup = session.isAdmin
      ? window.localStorage.getItem("relay-demo-access-view")
      : null;
    const effectiveIsAdmin = isEffectiveAdminForPreview(session.isAdmin, previewAccessGroup);
    setIsSignedIn(Boolean(session.user));
    setCurrentUserId(session.user?.id ?? null);
    setIsAdmin(effectiveIsAdmin);
    if (session.user) {
      setForm((current) => ({
        ...current,
        requesterName: current.requesterName || session.profile?.display_name || session.user?.email?.split("@")[0] || "",
        requesterEmail: current.requesterEmail || session.user?.email || "",
      }));
      if (effectiveIsAdmin) {
        const { data } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
        const loadedTickets = (data ?? []) as SupportTicket[];
        setTickets(loadedTickets);
        const loadedAttachments = SUPPORT_TICKET_IMAGES_ENABLED
          ? await fetchSupportTicketAttachments(supabase, loadedTickets.map((ticket) => ticket.id))
          : [];
        setAttachments(loadedAttachments.reduce<Record<string, SupportTicketAttachment[]>>((grouped, attachment) => {
          (grouped[attachment.support_ticket_id] ??= []).push(attachment);
          return grouped;
        }, {}));
      } else {
        setTickets([]);
        setAttachments({});
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/support-tickets", {
        method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(form),
      });
      const result = await response.json() as { error?: string; ticketId?: string; reference?: string };
      if (!response.ok) throw new Error(result.error || "Unable to submit the ticket.");
      let attachmentNotice = "";
      if (SUPPORT_TICKET_IMAGES_ENABLED && images.length > 0 && result.ticketId && currentUserId) {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Ticket submitted, but image upload is unavailable.");
        try {
          await uploadSupportTicketImages({ supabase, ticketId: result.ticketId, userId: currentUserId, files: images });
          attachmentNotice = ` ${images.length} image${images.length === 1 ? "" : "s"} attached.`;
        } catch (uploadError) {
          attachmentNotice = ` The ticket was submitted, but its images could not be attached: ${uploadError instanceof Error ? uploadError.message : "upload failed"}`;
        }
      }
      setNotice(`Ticket ${result.reference ?? ""} submitted. The admin team has been notified.${attachmentNotice}`);
      setForm((current) => ({ ...current, subject: "", description: "", website: "" }));
      setImages([]);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to submit the ticket."); }
    finally { setSaving(false); }
  }

  async function updateStatus(id: string, status: SupportTicketStatus) {
    const token = await getSupabaseAccessToken();
    if (!token) return;
    const response = await fetch(`/api/support-tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error || "Unable to update the ticket."); return; }
    await load();
  }

  const content = (
    <div className="support-ticket-page">
      <PageHeader
        title="Support Tickets"
        description="Report an issue or request help from the AssetCare+ administration team. Submitted tickets are visible only to administrators."
        meta={<><span className="relay-live-label"><i /> Shared support desk</span><span>Administrators are notified when a ticket is raised</span></>}
      />

      <SectionCard title="Raise a support ticket" description="Give the team enough detail to understand and investigate the issue.">
      <form onSubmit={submit} className="support-ticket-form">
        <div className="support-ticket-form-grid">
          <label className="support-ticket-field">Your name<input required minLength={2} value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} className="aurora-input" /></label>
          <label className="support-ticket-field">Email <span>Optional</span><input type="email" value={form.requesterEmail} onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })} className="aurora-input" /></label>
        </div>
        <label className="support-ticket-field">Subject<input required minLength={3} maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="aurora-input" placeholder="A short summary of the issue" /></label>
        <label className="support-ticket-field">What do you need help with?<textarea required minLength={10} maxLength={4000} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="aurora-textarea" placeholder="Include what happened, what you expected, and which page or device you were using." /></label>
        {SUPPORT_TICKET_IMAGES_ENABLED ? <div className="support-ticket-image-field">
          <div><strong>Images</strong><span>{isSignedIn ? "Optional · up to 10 MB each" : "Sign in to attach images"}</span></div>
          <label className={`relay-button relay-button-secondary ${!isSignedIn ? "support-ticket-upload-disabled" : ""}`}>
            Add images
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              disabled={!isSignedIn}
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                const invalid = selected.map(getAttachmentValidationError).find(Boolean);
                if (invalid) setNotice(invalid);
                else if (images.length + selected.length > 5) setNotice("You can attach up to 5 images to a support ticket.");
                else { setNotice(""); setImages((current) => [...current, ...selected]); }
                event.target.value = "";
              }}
            />
          </label>
          {imagePreviews.length > 0 ? <div className="support-ticket-image-previews">
            {imagePreviews.map(({ file, url }, index) => <figure key={`${file.name}-${file.lastModified}-${index}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Selected attachment ${file.name}`} />
              <figcaption><span>{file.name}</span><button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></figcaption>
            </figure>)}
          </div> : null}
        </div> : null}
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" />
        {notice ? <p className="aurora-alert support-ticket-notice">{notice}</p> : null}
        <button disabled={saving} className="relay-button relay-button-primary">{saving ? "Submitting…" : "Submit support ticket"}</button>
      </form>
      </SectionCard>

      {isAdmin ? <SectionCard title="Support ticket queue" description="Visible to administrators only." action={<button onClick={() => void load()} className="relay-button relay-button-secondary">Refresh</button>}>
        <div className="support-ticket-list">
          {loading ? <p className="support-ticket-empty">Loading tickets…</p> : tickets.length === 0 ? <p className="support-ticket-empty">No support tickets yet.</p> : tickets.map((ticket) => <article key={ticket.id} className="support-ticket-row">
            <div className="support-ticket-row-heading"><div><p className="support-ticket-reference">{ticket.reference}<span className={`support-ticket-status support-ticket-status-${ticket.status.toLowerCase()}`}>{ticket.status.replace("_", " ")}</span></p><h3>{ticket.subject}</h3></div><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ticket.created_at))}</time></div>
            <p className="support-ticket-description">{ticket.description}</p><p className="support-ticket-requester">Raised by {ticket.requester_name}{ticket.requester_email ? ` · ${ticket.requester_email}` : ""}</p>
            {(attachments[ticket.id]?.length ?? 0) > 0 ? <div className="support-ticket-row-images">
              {attachments[ticket.id].map((attachment) => attachment.signed_url ? <a key={attachment.id} href={attachment.signed_url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.signed_url} alt={attachment.file_name} />
              </a> : null)}
            </div> : null}
            {isAdmin ? <div className="support-ticket-actions">{(["OPEN", "IN_PROGRESS", "RESOLVED"] as SupportTicketStatus[]).map((status) => <button key={status} disabled={ticket.status === status} onClick={() => void updateStatus(ticket.id, status)} className="relay-button relay-button-ghost">{status.replace("_", " ")}</button>)}</div> : null}
          </article>)}
        </div>
      </SectionCard> : null}
    </div>
  );

  return isSignedIn ? <ConsoleShell eyebrow="AssetCare+ support" title="Support Tickets" contentClassName="console-content-support">{content}</ConsoleShell> : <main className="support-ticket-public">{content}</main>;
}
