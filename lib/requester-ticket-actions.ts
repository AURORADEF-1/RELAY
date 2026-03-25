"use client";

export const REQUESTER_COLLECTED_COMMENT = "Part collected by requester.";
const REQUESTER_RETURN_PREFIX = "Part return requested by requester. Reason:";

export function buildRequesterReturnComment(reason: string) {
  return `${REQUESTER_RETURN_PREFIX} ${reason.trim()}`;
}

export function isRequesterReturnComment(comment: string | null | undefined) {
  return comment?.startsWith(REQUESTER_RETURN_PREFIX) ?? false;
}
