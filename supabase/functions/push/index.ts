// Versendet Web-Push-Nachrichten. Aufgerufen von der Datenbank (public._push_send) mit einem gemeinsamen Geheimnis.
// Body: { secret, messages: [{ member_id?, title, body }] }. Ohne member_id geht die Nachricht an alle Abos.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const input = await req.json().catch(() => null);
  const { data: cfg } = await db.from("push_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !input || input.secret !== cfg.hook_secret || !Array.isArray(input.messages)) return new Response("Forbidden", { status: 403 });

  webpush.setVapidDetails("mailto:oerny76@googlemail.com", cfg.vapid_public, cfg.vapid_private);
  let sent = 0, removed = 0;
  for (const m of input.messages) {
    let q = db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (m.member_id) q = q.eq("member_id", m.member_id);
    const { data: subs } = await q;
    const payload = JSON.stringify({ title: String(m.title || "Griassgottbeinand"), body: String(m.body || "") });
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); removed++; }
        else console.error("push failed", e.statusCode, e.body);
      }
    }));
  }
  return Response.json({ sent, removed });
});
