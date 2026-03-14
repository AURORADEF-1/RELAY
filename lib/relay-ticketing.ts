import type { SupabaseClient } from "@supabase/supabase-js";

export const RELAY_MEDIA_BUCKET = "relay-ticket-media";

export type TicketAttachmentRecord = {
  id: string;
  ticket_id: string;
  uploaded_by_user_id: string | null;
  attachment_kind: "ticket" | "chat";
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  public_url: string | null;
  created_at: string | null;
};

export type TicketMessageRecord = {
  id: string;
  ticket_id: string;
  sender_user_id: string | null;
  sender_role: "requester" | "parts" | "admin" | "ai";
  message_text: string | null;
  attachment_id: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  is_ai_message: boolean | null;
  created_at: string | null;
};

export async function uploadTicketAttachments({
  supabase,
  ticketId,
  userId,
  files,
  attachmentKind,
}: {
  supabase: SupabaseClient;
  ticketId: string;
  userId: string | null;
  files: File[];
  attachmentKind: "ticket" | "chat";
}) {
  const uploaded: TicketAttachmentRecord[] = [];

  for (const file of files) {
    const storagePath = buildStoragePath(ticketId, attachmentKind, file.name);
    const { error: uploadError } = await supabase.storage
      .from(RELAY_MEDIA_BUCKET)
      .upload(storagePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(RELAY_MEDIA_BUCKET).getPublicUrl(storagePath);

    const { data, error } = await supabase
      .from("ticket_attachments")
      .insert({
        ticket_id: ticketId,
        uploaded_by_user_id: userId,
        attachment_kind: attachmentKind,
        storage_bucket: RELAY_MEDIA_BUCKET,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        public_url: publicUrl,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    uploaded.push(data as TicketAttachmentRecord);
  }

  return uploaded;
}

export async function fetchTicketAttachments(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("ticket_attachments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TicketAttachmentRecord[];
}

export async function fetchTicketMessages(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TicketMessageRecord[];
}

export async function createTicketMessage({
  supabase,
  ticketId,
  senderUserId,
  senderRole,
  messageText,
  attachments = [],
}: {
  supabase: SupabaseClient;
  ticketId: string;
  senderUserId: string | null;
  senderRole: "requester" | "parts" | "admin";
  messageText: string;
  attachments?: TicketAttachmentRecord[];
}) {
  const trimmedText = messageText.trim();

  if (attachments.length === 0) {
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_user_id: senderUserId,
      sender_role: senderRole,
      message_text: trimmedText || null,
      is_ai_message: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  for (const [index, attachment] of attachments.entries()) {
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_user_id: senderUserId,
      sender_role: senderRole,
      message_text: index === 0 ? trimmedText || null : null,
      attachment_id: attachment.id,
      attachment_url: attachment.public_url,
      attachment_type: attachment.mime_type,
      is_ai_message: false,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

function buildStoragePath(
  ticketId: string,
  attachmentKind: "ticket" | "chat",
  fileName: string,
) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const timestamp = Date.now();
  return `tickets/${ticketId}/${attachmentKind}/${timestamp}-${safeName}`;
}
