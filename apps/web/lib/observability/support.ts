"use client";

import type { SupportIdentityResponse } from "@playwithpro/shared";
import { apiFetch } from "@/lib/api";
import {
  conversations,
  currentSessionId,
  setPersonProperties,
  setVerifiedIdentity,
} from "./client";

/** Where the panel was opened from; becomes the first message's context. */
export interface SupportContext {
  kind: "menu" | "error" | "payment" | "room" | "dispute";
  errorId?: string;
  sessionId?: string;
}

export interface SupportMessage {
  id: string;
  body: string;
  author: "customer" | "team";
  authorName?: string;
  createdAt: string;
}

/** Replies are fetched this often while the panel is open. */
export const SUPPORT_POLL_MS = 10_000;

/** True once the vendor's conversations extension is loaded for this project. */
export function isSupportAvailable(): boolean {
  return conversations()?.isAvailable() ?? false;
}

/**
 * Signed-in users: fetch the API-computed HMAC so tickets follow the user
 * across devices. The email is attached only here (never at identify).
 */
export async function verifySupportIdentity(email: string): Promise<boolean> {
  try {
    const response = await apiFetch("/support/identity");
    if (!response.ok) return false;
    const identity = (await response.json()) as SupportIdentityResponse;
    setVerifiedIdentity(identity.userId, identity.hash);
    setPersonProperties({ email });
    return true;
  } catch {
    return false;
  }
}

function contextLine(context: SupportContext): string {
  const parts = [`[${context.kind}]`];
  if (context.errorId) parts.push(`error ${context.errorId}`);
  if (context.sessionId) parts.push(`session ${context.sessionId}`);
  const replay = currentSessionId();
  if (replay) parts.push(`replay ${replay}`);
  return parts.join(" · ");
}

/**
 * Sends a message into the current ticket (or opens one). The first message
 * of a conversation carries the entry-point context so the operator sees
 * where the user was. Returns the ticket id, or null when unavailable.
 */
export async function sendSupportMessage(
  body: string,
  options: { context?: SupportContext; email?: string; name?: string },
): Promise<string | null> {
  const api = conversations();
  if (!api?.isAvailable()) return null;
  const isNew = api.getCurrentTicketId() === null;
  const text =
    isNew && options.context
      ? `${contextLine(options.context)}\n\n${body}`
      : body;
  const traits =
    options.email || options.name
      ? { email: options.email, name: options.name }
      : undefined;
  const response = await api.sendMessage(text, traits);
  return response?.ticket_id ?? null;
}

export async function fetchSupportMessages(
  after?: string,
): Promise<SupportMessage[] | null> {
  const api = conversations();
  if (!api?.isAvailable() || api.getCurrentTicketId() === null) return null;
  const response = await api.getMessages(undefined, after);
  if (!response) return null;
  return response.messages
    .filter((message) => !message.is_private)
    .map((message) => ({
      id: message.id,
      body: message.content,
      author: message.author_type === "customer" ? "customer" : "team",
      authorName: message.author_name,
      createdAt: message.created_at,
    }));
}

export async function markSupportRead(): Promise<void> {
  const api = conversations();
  if (!api?.isAvailable() || api.getCurrentTicketId() === null) return;
  await api.markAsRead();
}
