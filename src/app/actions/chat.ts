"use server";

import { requireOrg } from "@/lib/tenant";
import { MAX_ATTACH_BYTES, type ChatMessageDto } from "@/lib/chat-rules";
import * as chat from "@/lib/chat-service";

export type ChatActionResult = { ok: true; message: ChatMessageDto } | { ok: false; error: string };

async function me(): Promise<chat.Ctx> {
  const org = await requireOrg();
  return { organizationId: org.organizationId, userId: org.userId, role: org.role };
}

/** Sends a message (with an optional photo or file) to a room. The server checks the person may use that room. */
export async function sendMessageAction(room: string, formData: FormData): Promise<ChatActionResult> {
  const ctx = await me();
  const f = formData.get("file");
  let file: { name: string; bytes: Uint8Array } | null = null;
  if (f instanceof File && f.size > 0) {
    if (f.size > MAX_ATTACH_BYTES) return { ok: false, error: "That file is over 4 MB. Choose a smaller one." };
    file = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
  }
  return chat.sendMessage(ctx, { room, body: formData.get("body"), file }, Date.now());
}

export async function editMessageAction(seq: number, body: string): Promise<ChatActionResult> {
  return chat.editMessage(await me(), seq, body, Date.now());
}

export async function deleteMessageAction(seq: number): Promise<ChatActionResult> {
  return chat.deleteMessage(await me(), seq, Date.now());
}

export async function setStatusAction(status: string, note: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return chat.setMyStatus(await me(), status, note, Date.now());
}
