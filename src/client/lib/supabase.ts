import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.ts";

export const supabase = createClient<Database>(process.env.PUBLIC_SUPABASE_URL!, process.env.PUBLIC_SUPABASE_ANON_KEY!);

/** Unwraps a Supabase result, throwing its error so callers can use plain try/catch. */
export function must<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

export const report = (err: unknown) => alert(err instanceof Error ? err.message : String(err));

type Handler = { event: string; onMessage: (payload: any) => void; onSync?: () => void };
const topics = new Map<string, { channel: RealtimeChannel; handlers: Set<Handler> }>();

/**
 * Listen to a private broadcast topic. One channel per topic is shared by all
 * listeners (joining the same topic twice on one socket stalls). `onSync` fires
 * on (re)connect so callers can refetch whatever they missed.
 */
export function subscribe(topic: string, event: string, onMessage: (payload: any) => void, onSync?: () => void) {
  let entry = topics.get(topic);
  if (!entry) {
    const channel = supabase.channel(topic, { config: { private: true } });
    const created = { channel, handlers: new Set<Handler>() };
    channel.on("broadcast", { event: "*" }, (m) => created.handlers.forEach((h) => h.event === m.event && h.onMessage(m.payload)));
    supabase.realtime.setAuth().then(() =>
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") created.handlers.forEach((h) => h.onSync?.());
      }),
    );
    topics.set(topic, (entry = created));
  }
  const handler = { event, onMessage, onSync };
  const current = entry;
  current.handlers.add(handler);
  return () => {
    current.handlers.delete(handler);
    if (current.handlers.size) return;
    topics.delete(topic);
    supabase.removeChannel(current.channel);
  };
}
