// End-to-end check of RLS, RPCs, triggers, storage and realtime against a real project.
// Run: bun run check:rls   (needs PUBLIC_SUPABASE_* and SUPABASE_SECRET_KEY in .env)
// Creates throwaway users and deletes them afterwards.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/shared/types/database.ts";

const url = process.env.PUBLIC_SUPABASE_URL!;
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${JSON.stringify(detail)}`}`);
};

const run = `rls${Date.now()}`;
const userIds: string[] = [];

async function user(name: string) {
  const email = `${run}.${name}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "password123", email_confirm: true, user_metadata: { name } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password: "password123" });
  if (e) throw e;
  return { client, id: data.user.id, email };
}

function listen(client: SupabaseClient<Database>, topic: string, event: string) {
  const got: unknown[] = [];
  return new Promise<{ status: string; got: unknown[]; error?: string }>((resolve) => {
    client.realtime.setAuth().then(() => {
      client
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event }, (m) => got.push(m.payload))
        .subscribe((status, err) => {
          if (status !== "JOINING") resolve({ status, got, error: err?.message });
        });
    });
  });
}

try {
  const alice = await user("Alice");
  const bob = await user("Bob");
  const eve = await user("Eve");

  const { data: ws, error: wsErr } = await alice.client.rpc("create_workspace", { p_name: "Team" });
  check("alice creates workspace", !wsErr && !!ws, wsErr);
  const { error: addErr } = await alice.client.rpc("add_workspace_member", { p_workspace: ws!, p_email: bob.email.toUpperCase() });
  check("owner adds member by email (case-insensitive)", !addErr, addErr);
  const { error: bobAdd } = await bob.client.rpc("add_workspace_member", { p_workspace: ws!, p_email: eve.email });
  check("member cannot add members", !!bobAdd);

  const { data: board, error: boardErr } = await alice.client.from("boards").insert({ workspace_id: ws!, title: "Sprint" }).select().single();
  if (boardErr) throw new Error(boardErr.message);
  const { data: list } = await alice.client.from("lists").insert({ board_id: board!.id, title: "Todo", position: 1024 }).select().single();
  check("alice creates board + list", !!board && !!list);

  const aliceTopic = await listen(alice.client, `board:${board!.id}`, "changed");
  const aliceInbox = await listen(alice.client, `user:${alice.id}`, "notification");
  const eveTopic = await listen(eve.client, `board:${board!.id}`, "changed");
  check("alice joins private board topic", aliceTopic.status === "SUBSCRIBED", aliceTopic);
  check("eve is refused board topic", eveTopic.status !== "SUBSCRIBED", eveTopic);

  const { data: card, error: cardErr } = await bob.client.from("cards").insert({ list_id: list!.id, title: "Write code", position: 1024 }).select().single();
  check("bob (member) adds card", !!card, cardErr);
  const { error: commentErr } = await bob.client.from("comments").insert({ card_id: card!.id, body: "looks good" });
  check("bob comments", !commentErr, commentErr);
  const { error: spoof } = await bob.client.from("comments").insert({ card_id: card!.id, body: "x", user_id: alice.id });
  check("bob cannot comment as alice", !!spoof);

  await Bun.sleep(1500);
  check("alice got board:changed broadcasts", aliceTopic.got.length >= 2, aliceTopic.got.length);
  check("alice got comment notification", aliceInbox.got.some((n: any) => n.type === "comment"), aliceInbox.got);
  check("eve got no broadcasts", eveTopic.got.length === 0, eveTopic.got);

  const { data: bobNotes } = await bob.client.from("notifications").select("id,type,data");
  check("bob sees workspace:added", bobNotes?.some((n) => n.type === "workspace:added") ?? false, bobNotes);
  const { error: tamper } = await bob.client.from("notifications").update({ data: { x: "y" } }).eq("id", bobNotes![0]!.id);
  check("bob cannot edit notification data", !!tamper);
  const { error: markRead } = await bob.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", bob.id);
  check("bob can mark read", !markRead, markRead);

  for (const table of ["workspaces", "boards", "lists", "cards", "comments", "notifications"] as const) {
    const { data } = await eve.client.from(table).select("*");
    check(`eve reads nothing from ${table}`, data?.length === 0, data);
  }
  const { data: eveProfiles } = await eve.client.from("profiles").select("id");
  check("eve sees only her own profile", eveProfiles?.length === 1 && eveProfiles[0]!.id === eve.id, eveProfiles);
  const { error: eveCard } = await eve.client.from("cards").insert({ list_id: list!.id, title: "pwn", position: 1 });
  check("eve cannot add card to alice's list", !!eveCard);
  const { data: eveUpd } = await eve.client.from("cards").update({ title: "pwn" }).eq("id", card!.id).select();
  check("eve cannot edit card", eveUpd?.length === 0, eveUpd);
  const { data: bobDel } = await bob.client.from("boards").delete().eq("id", board!.id).select();
  check("member cannot delete board", bobDel?.length === 0, bobDel);

  const path = `${card!.id}/${crypto.randomUUID()}-note.txt`;
  const { error: upErr } = await bob.client.storage.from("attachments").upload(path, new Blob(["hi"], { type: "text/plain" }));
  check("member uploads attachment", !upErr, upErr);
  const { error: eveUp } = await eve.client.storage.from("attachments").upload(`${card!.id}/evil.txt`, new Blob(["x"]));
  check("eve cannot upload to card", !!eveUp);
  const { data: eveSigned } = await eve.client.storage.from("attachments").createSignedUrl(path, 60);
  check("eve cannot sign url", !eveSigned);
  const { data: signed } = await alice.client.storage.from("attachments").createSignedUrl(path, 60);
  check("alice can download", !!signed && (await fetch(signed.signedUrl).then((r) => r.text())) === "hi");
  await alice.client.storage.from("attachments").remove([path]);

  const { data: delBoard } = await alice.client.from("boards").delete().eq("id", board!.id).select();
  check("owner deletes board", delBoard?.length === 1, delBoard);
} catch (err) {
  check("script ran to completion", false, String(err));
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await admin.from("workspaces").delete().eq("name", "Team"); // workspaces outlive users; remove test ones
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
