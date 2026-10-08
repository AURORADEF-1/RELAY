import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RELAY_MEDIA_BUCKET,
  validateAttachmentFile,
} from "@/lib/relay-ticketing";
import type { SupportTicketAttachment } from "@/lib/support-tickets";

export async function uploadSupportTicketImages({
  supabase,
  ticketId,
  userId,
  files,
}: {
  supabase: SupabaseClient;
  ticketId: string;
  userId: string;
  files: File[];
}) {
  for (const [index, file] of files.entries()) {
    validateAttachmentFile(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${userId}/support-${ticketId}/${Date.now()}-${index}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(RELAY_MEDIA_BUCKET)
      .upload(filePath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);

    const { error: registerError } = await supabase.rpc("register_support_ticket_attachment", {
      p_ticket_id: ticketId,
      p_file_name: file.name,
      p_file_path: filePath,
      p_mime_type: file.type,
      p_file_size: file.size,
    });
    if (registerError) {
      await supabase.storage.from(RELAY_MEDIA_BUCKET).remove([filePath]);
      throw new Error(registerError.message);
    }
  }
}

export async function fetchSupportTicketAttachments(
  supabase: SupabaseClient,
  ticketIds: string[],
) {
  if (ticketIds.length === 0) return [];
  const { data, error } = await supabase
    .from("support_ticket_attachments")
    .select("*")
    .in("support_ticket_id", ticketIds)
    .order("created_at", { ascending: true });
  if (error) return [];

  return Promise.all(
    ((data ?? []) as SupportTicketAttachment[]).map(async (attachment) => {
      const { data: signed } = await supabase.storage
        .from(RELAY_MEDIA_BUCKET)
        .createSignedUrl(attachment.file_path, 60 * 60);
      return { ...attachment, signed_url: signed?.signedUrl ?? null };
    }),
  );
}
