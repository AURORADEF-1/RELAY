import type { SupabaseClient } from "@supabase/supabase-js";

export const RELAY_MEDIA_BUCKET = "relay-ticket-media";
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type TicketAttachmentRecord = {
  id: string;
  ticket_id: string;
  uploaded_by: string | null;
  file_name: string | null;
  file_path: string | null;
  file_url: string | null;
  signed_url?: string | null;
  mime_type: string | null;
  attachment_context: "ticket" | "chat";
  message_id: string | null;
  created_at: string | null;
};

export type TicketMessageRecord = {
  id: string;
  ticket_id: string;
  sender_user_id: string | null;
  sender_role: "requester" | "operator" | "admin" | "ai" | "parts";
  message_text: string | null;
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
  messageId?: string | null;
}) {
  if (!userId) {
    throw new Error("You must be signed in to upload ticket images.");
  }

  const uploaded: TicketAttachmentRecord[] = [];

  for (const file of files) {
    validateAttachmentFile(file);

    const storagePath = buildStoragePath({
      userId,
      ticketId,
      attachmentKind,
      fileName: file.name,
    });
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
        uploaded_by: userId,
        file_name: file.name,
        file_path: storagePath,
        file_url: publicUrl,
        mime_type: file.type || null,
        attachment_context: attachmentKind,
        message_id: null,
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

  return hydrateTicketAttachmentsWithSignedUrls(
    supabase,
    (data ?? []) as TicketAttachmentRecord[],
  );
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

  return ((data ?? []) as TicketMessageRecord[]).map((message) => ({
    ...message,
    sender_role: message.sender_role === "parts" ? "operator" : message.sender_role,
  }));
}

export async function deleteTicketAttachmentsForTicket(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("ticket_attachments")
    .select("id, file_path")
    .eq("ticket_id", ticketId);

  if (error) {
    throw new Error(error.message);
  }

  const attachments = (data ?? []) as Array<{ id: string; file_path: string | null }>;
  const filePaths = attachments
    .map((attachment) => attachment.file_path)
    .filter((filePath): filePath is string => Boolean(filePath));

  if (filePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(RELAY_MEDIA_BUCKET)
      .remove(filePaths);

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  if (attachments.length > 0) {
    const { error: deleteError } = await supabase
      .from("ticket_attachments")
      .delete()
      .eq("ticket_id", ticketId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }
}

export async function saveAnnotatedTicketAttachment({
  supabase,
  attachmentId,
  dataUrl,
}: {
  supabase: SupabaseClient;
  attachmentId: string;
  dataUrl: string;
}) {
  const { data: attachment, error: attachmentError } = await supabase
    .from("ticket_attachments")
    .select("id, ticket_id, file_name, mime_type")
    .eq("id", attachmentId)
    .single();

  if (attachmentError || !attachment?.ticket_id) {
    throw new Error(attachmentError?.message || "Attachment not found.");
  }

  const contentType = getAnnotationContentType(attachment.mime_type);
  const blob = dataUrlToBlob(dataUrl, contentType);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw new Error(userError?.message || "You must be signed in to save the edited photo.");
  }

  const fileName = `annotated-${normalizeAttachmentFileName(attachment.file_name, contentType)}`;
  const file = new File([blob], fileName, { type: contentType });

  await uploadTicketAttachments({
    supabase,
    ticketId: attachment.ticket_id,
    userId: user.id,
    files: [file],
    attachmentKind: "ticket",
  });
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
  senderRole: "requester" | "operator" | "admin";
  messageText: string;
  attachments?: TicketAttachmentRecord[];
}) {
  const trimmedText = messageText.trim();
  const createdMessages: TicketMessageRecord[] = [];

  if (attachments.length === 0) {
    const { data, error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_user_id: senderUserId,
        sender_role: senderRole,
        message_text: trimmedText || null,
        is_ai_message: false,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    createdMessages.push(data as TicketMessageRecord);
    return createdMessages;
  }

  for (const [index, attachment] of attachments.entries()) {
    const { data, error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_user_id: senderUserId,
        sender_role: senderRole,
        message_text: index === 0 ? trimmedText || null : null,
        attachment_url: attachment.file_url,
        attachment_type: attachment.mime_type,
        is_ai_message: false,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const { error: linkError } = await supabase
      .from("ticket_attachments")
      .update({ message_id: data.id })
      .eq("id", attachment.id);

    if (linkError) {
      throw new Error(linkError.message);
    }

    createdMessages.push(data as TicketMessageRecord);
  }

  return createdMessages;
}

function buildStoragePath(
  {
    userId,
    ticketId,
    attachmentKind,
    fileName,
  }: {
    userId: string;
    ticketId: string;
    attachmentKind: "ticket" | "chat";
    fileName: string;
  },
) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return attachmentKind === "ticket"
    ? `${userId}/${ticketId}/${safeName}`
    : `${userId}/${ticketId}/chat-${Date.now()}-${safeName}`;
}

export function validateAttachmentFile(file: File) {
  const validationError = getAttachmentValidationError(file);

  if (validationError) {
    throw new Error(validationError);
  }
}

export function getAttachmentValidationError(file: File) {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return "Unsupported image format. Please upload JPG, PNG, WEBP, or HEIC images.";
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return "Image is too large. Please upload files up to 10 MB.";
  }

  return null;
}

async function hydrateTicketAttachmentsWithSignedUrls(
  supabase: SupabaseClient,
  attachments: TicketAttachmentRecord[],
) {
  return Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      signed_url: await createSignedAttachmentUrl(supabase, attachment.file_path),
    })),
  );
}

async function createSignedAttachmentUrl(
  supabase: SupabaseClient,
  filePath: string | null,
) {
  if (!filePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(RELAY_MEDIA_BUCKET)
    .createSignedUrl(filePath, 60 * 60);

  if (error) {
    console.error("Failed to create signed attachment URL", {
      filePath,
      message: error.message,
    });
    return null;
  }

  return data.signedUrl;
}

function dataUrlToBlob(dataUrl: string, contentType: string) {
  const [, base64Payload] = dataUrl.split(",");

  if (!base64Payload) {
    throw new Error("Invalid image payload.");
  }

  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}

function getAnnotationContentType(mimeType: string | null) {
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") {
    return mimeType;
  }

  return "image/png";
}

function normalizeAttachmentFileName(fileName: string | null, contentType: string) {
  const baseName = (fileName || "attachment").replace(/\.[^.]+$/, "");

  switch (contentType) {
    case "image/jpeg":
      return `${baseName}.jpg`;
    case "image/webp":
      return `${baseName}.webp`;
    default:
      return `${baseName}.png`;
  }
}
