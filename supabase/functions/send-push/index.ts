// Verschickt Web-Push-Nachrichten, die die Datenbank (bwau_dispatch_push) übergibt.
// Geheimnisse: VAPID_PUBLIC, VAPID_PRIVATE, CRON_SECRET (supabase secrets set).
import webpush from "npm:web-push@3.6.7";

type Message = { endpoint: string; p256dh: string; auth: string; title: string; body: string };

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
webpush.setVapidDetails("https://realcrancko.github.io/bwau/", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response("nicht erlaubt", { status: 403 });
  const { messages = [] } = await req.json().catch(() => ({})) as { messages?: Message[] };
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(messages.map(async (m) => {
    try {
      await webpush.sendNotification(
        { endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } },
        JSON.stringify({ title: m.title, body: m.body }),
        { TTL: 60, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(m.endpoint);
      else console.error("Push fehlgeschlagen", status, (e as Error).message);
    }
  }));
  if (gone.length) {
    // Nicht mehr erreichbare Geräte über die abgesicherte Datenbankfunktion entfernen
    await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/bwau_drop_subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      body: JSON.stringify({ secret: CRON_SECRET, endpoints: gone }),
    }).catch((e) => console.error("Aufräumen fehlgeschlagen", e));
  }
  return Response.json({ sent, gone: gone.length });
});
