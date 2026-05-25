import { supabase } from "./supabase";

// Anonymous conversation logging for usage analytics ("what are people searching").
// No user identity is stored — only a client-supplied random session_id and the
// message text the resident types. For production, consider scrubbing addresses/
// names from `content` and setting a retention window (Phase 8).
//
// All writers are best-effort: callers wrap them so a logging failure never
// breaks the user's response.

export async function createConversation(
  sessionId: string | null,
  lang: string | null,
): Promise<string | null> {
  const { data, error } = await supabase()
    .from("conversations")
    .insert({ session_id: sessionId, lang })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function logMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  intent: string | null,
): Promise<void> {
  const { error } = await supabase()
    .from("messages")
    .insert({ conversation_id: conversationId, role, content: content.slice(0, 8000), intent });
  if (error) throw new Error(error.message);
}

export async function logEvent(
  conversationId: string,
  type: string,
  extra: { ka?: string | null; caid?: string | null; deep_link_clicked?: boolean | null } = {},
): Promise<void> {
  const { error } = await supabase()
    .from("events")
    .insert({ conversation_id: conversationId, type, ...extra });
  if (error) throw new Error(error.message);
}

// Pull the caid out of a servicerequest-create deep-link, for event attribution.
export function caidFromUrl(url: string): string | null {
  return new URL(url).searchParams.get("caid");
}
