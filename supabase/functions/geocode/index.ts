// Trägt Koordinaten für eine Location ein (für die Wetteranzeige). Aufgerufen von der Datenbank (Trigger auf meetings) mit gemeinsamem Geheimnis.
// Body: { secret, location_id }. Suche über Photon und Nominatim (OpenStreetMap-Daten): höchstens 1 Anfrage pro Sekunde, eigener User-Agent, keine Massenabfragen.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UA = "Griassgottbeinand-Stammtisch-App (oerny76@googlemail.com)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Photon (Komoot, OpenStreetMap-Daten) zuerst, Nominatim als Rückfall. Die öffentliche Nominatim-Instanz sperrt manche Rechenzentrums-Adressen (403).
async function search(q: string): Promise<{ lat: number; lon: number } | null> {
  const headers = { "User-Agent": UA, "Accept-Language": "de" };
  const res = await fetch("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(q), { headers }).catch(() => null);
  if (res && res.ok) {
    const c = (await res.json())?.features?.[0]?.geometry?.coordinates;
    if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) return { lat: c[1], lon: c[0] };
    return null;
  }
  const nom = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q), { headers });
  if (!nom.ok) throw new Error(`Photon ${res ? res.status : "Fehler"}, Nominatim ${nom.status}`);
  const hit = (await nom.json())[0];
  const lat = hit && Number(hit.lat), lon = hit && Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const input = await req.json().catch(() => null);
  const { data: cfg } = await db.from("push_config").select("hook_secret").eq("id", 1).maybeSingle();
  if (!cfg || !input || input.secret !== cfg.hook_secret || typeof input.location_id !== "string") return new Response("Forbidden", { status: 403 });

  const { data: loc } = await db.from("locations").select("id, name, street, zip, city, country, lat").eq("id", input.location_id).maybeSingle();
  if (!loc) return new Response("Not found", { status: 404 });
  if (loc.lat != null) return Response.json({ ok: true, skipped: true });

  const place = [loc.zip, loc.city].filter(Boolean).join(" ");
  const address = [loc.street, place, loc.country].filter(Boolean).join(", ");
  // Erst Name mit Adresse, dann nur die Adresse, dann nur der Name, zuletzt die ersten zwei Wörter des Namens (lange Namen wie "X Wirtshaus & Schänke" findet OSM oft nur gekürzt).
  const short = loc.name.split(/\s+/).slice(0, 2).join(" ");
  const queries = [...new Set([[loc.name, address].filter(Boolean).join(", "), loc.street || place ? address : "", loc.name, short].filter(Boolean))];
  const errors: string[] = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(1100);
    const hit = await search(queries[i]).catch((e) => { errors.push(String(e.message || e)); return null; });
    if (hit) {
      await db.from("locations").update(hit).eq("id", loc.id);
      return Response.json({ ok: true, query: queries[i], ...hit });
    }
  }
  return Response.json({ ok: false, errors });
});
