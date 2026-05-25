import { supabase } from "./supabase";

// Input + rate-limit guards for the public API routes.

export const MAX_MESSAGE_CHARS = 2000;

export function tooLong(s: string): boolean {
  return s.length > MAX_MESSAGE_CHARS;
}

// Caller identity for rate limiting: first X-Forwarded-For IP, else a fallback.
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim();
  return `ip:${ip || "unknown"}`;
}

// Best-effort fixed-window limiter (Postgres RPC from migration 0003).
// Returns true if allowed. On any error (RPC missing, DB down) it ALLOWS the
// request — never lock users out because the limiter itself failed.
export async function rateLimit(key: string, max = 30, windowSeconds = 60): Promise<boolean> {
  try {
    const { data, error } = await supabase().rpc("rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
