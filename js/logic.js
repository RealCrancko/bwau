// Reine Rechenlogik ohne DOM und ohne Datenbank – Empfehlungen, Hevy-CSV, Formatierung.

export const e1rm = (w, r) => w * (1 + r / 30);
export const round4 = x => Math.round(x * 4) / 4;
export const fmtW = w => (Math.round(w * 100) / 100).toLocaleString("de-DE");
export const fmtD = d => new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
export const fmtDT = d => new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const normName = n => n.replace(/\(Kabelzug\)/g, "(Kabel)").replace(/SZ-Stange/g, "EZ-Hantel").replace(/\s+/g, " ").trim();

export const DEFAULT_EXERCISES = [
  "Bankdrücken (Langhantel)", "Schrägbankdrücken (Langhantel)", "Bankdrücken (Kurzhantel)", "Schrägbankdrücken (Kurzhantel)",
  "Bankdrücken (Maschine)", "Fliegende (Maschine)", "Butterfly (Kabel)", "Dips",
  "Schulterdrücken (Langhantel)", "Schulterdrücken (Kurzhantel)", "Schulterdrücken (Maschine)",
  "Seitheben (Kurzhantel)", "Seitheben (Maschine)", "Seitheben (Kabel)", "Reverse Fliegende (Maschine)", "Face Pulls (Kabel)",
  "Trizeps-Pushdown (Kabel)", "Überkopf-Trizepsstrecken (Kabel)", "Trizepsdrücken", "French Press (EZ-Hantel)",
  "Klimmzüge", "Latzug (Kabel)", "Rudern am Kabel sitzend", "T-Bar Rudern", "Langhantelrudern", "Kurzhantelrudern",
  "Iso-Laterales Rudern (Maschine)", "Iso-Laterales Rudern von oben (Maschine)",
  "Kreuzheben (Langhantel)", "Rumänisches Kreuzheben (Langhantel)",
  "Bizepscurl (EZ-Hantel)", "Bizepscurl (Kurzhantel)", "Hammer Curl (Kurzhantel)", "Hammer Curl (Kabel)",
  "Preacher Curl (Maschine)", "Konzentrationscurl",
  "Kniebeugen (Langhantel)", "Frontkniebeugen", "Beinpresse", "Hackenschmidt", "Bulgarian Split Squat",
  "Beinstrecker (Maschine)", "Beinbeuger liegend (Maschine)", "Beinbeuger sitzend (Maschine)", "Hip Thrust (Langhantel)",
  "Wadenheben stehend (Maschine)", "Wadenheben sitzend (Maschine)", "Adduktoren (Maschine)", "Abduktoren (Maschine)",
  "Crunch (Kabel)", "Beinheben hängend",
];

// ---------- Hevy-CSV ----------

export function parseCSV(s) {
  s = s.replace(/^﻿/, "");
  const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = "" }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); out.push(row); row = []; f = "" }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row) }
  const [h, ...r] = out; if (!h) return [];
  return r.filter(x => x.length > 1).map(x => Object.fromEntries(h.map((k, i) => [k.trim(), x[i]])));
}

const MON = { jan: 0, feb: 1, "mär": 2, mar: 2, apr: 3, mai: 4, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11 };
export function parseHevyDate(s) {
  const m = /(\d{1,2})\.?\s+([A-Za-zÄÖÜäöü]+)\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(s || "");
  if (m) { const mo = MON[m[2].slice(0, 3).toLowerCase()]; if (mo != null) return new Date(+m[3], mo, +m[1], +m[4], +m[5]) }
  const d = new Date(s); return isNaN(d) ? null : d;
}

// Hevy-Zeilen → [{title, started_at, ended_at, sets:[{exercise,set_index,weight,reps}]}]
export function hevyToWorkouts(rows) {
  if (!rows.length || !("exercise_title" in rows[0])) throw new Error("Das ist kein Hevy-Export: Die Spalte „exercise_title“ fehlt.");
  const map = new Map();
  for (const r of rows) {
    const reps = parseInt(r.reps, 10), w = parseFloat(r.weight_kg || "0");
    if (!r.exercise_title || !(reps > 0) || isNaN(w)) continue;
    if (r.set_type === "warmup") continue;
    const d = parseHevyDate(r.start_time); if (!d) continue;
    const key = d.toISOString();
    const wo = map.get(key) ?? { title: r.title || "Training", started_at: key, ended_at: parseHevyDate(r.end_time)?.toISOString() ?? key, sets: [] };
    const exercise = normName(r.exercise_title);
    wo.sets.push({ exercise, set_index: wo.sets.filter(s => s.exercise === exercise).length, weight: w, reps });
    map.set(key, wo);
  }
  return [...map.values()].sort((a, b) => a.started_at.localeCompare(b.started_at));
}

// ---------- Verlauf pro Übung ----------

// sets: [{workout_id, exercise, weight, reps, performed_at}], workouts: Map id → {title, started_at}
export function historyByExercise(sets, workouts, excludeWorkout) {
  const ex = new Map();
  for (const s of sets) {
    if (s.workout_id === excludeWorkout) continue;
    const e = ex.get(s.exercise) ?? { name: s.exercise, sessions: new Map() };
    const wo = workouts.get(s.workout_id);
    const sess = e.sessions.get(s.workout_id) ?? { d: new Date(wo?.started_at ?? s.performed_at), title: wo?.title ?? "", sets: [] };
    sess.sets.push({ w: +s.weight, r: +s.reps, i: s.set_index ?? 0 });
    e.sessions.set(s.workout_id, sess);
    ex.set(s.exercise, e);
  }
  for (const e of ex.values()) {
    e.sessions = [...e.sessions.values()].sort((a, b) => a.d - b.d);
    e.sessions.forEach(s => { s.sets.sort((a, b) => a.i - b.i); summarize(s) });
  }
  return ex;
}

function summarize(s) {
  const cnt = new Map(); s.sets.forEach(x => cnt.set(x.w, (cnt.get(x.w) || 0) + 1));
  let ww = null, best = -1;
  for (const [w, c] of cnt) if (c > best || (c === best && w > ww)) { best = c; ww = w }
  // Ein einzelner schwerer Satz mit 1–2 Wdh. ist ein Test, kein Arbeitsgewicht
  const real = s.sets.filter(x => !(x.r <= 2 && x.w > ww));
  if (cnt.size > 1 && best === 1) ww = real.reduce((a, b) => b.w > a.w ? b : a).w;
  s.ww = ww; s.top = Math.max(...s.sets.filter(x => x.w === ww).map(x => x.r));
  s.e1 = Math.max(...real.map(x => e1rm(x.w, x.r)));
}

export function autoStep(e) {
  const ws = [...new Set(e.sessions.map(s => s.ww))].sort((a, b) => a - b);
  let st = Infinity;
  for (let i = 1; i < ws.length; i++) { const d = ws[i] - ws[i - 1]; if (d >= 1.25 && d < st) st = d }
  if (st === Infinity || st > 10) st = /Langhantel|EZ|Kurzhantel/.test(e.name) ? 2.5 : 5;
  // Mehr als ~15 % auf einmal ist zu viel, v. a. bei leichten Kurzhanteln
  const w = e.sessions[e.sessions.length - 1].ww;
  if (w > 0 && st > w * 0.15) st = w < 30 ? 2 : 2.5;
  return st;
}

// cfg: {min, max, step?}
export function advise(e, cfg) {
  const S = e.sessions, L = S[S.length - 1], w = L.ww;
  const c = { min: cfg.min, max: cfg.max, step: cfg.step ?? autoStep(e) };
  const streak = []; for (let i = S.length - 1; i >= 0 && S[i].ww === w; i--) streak.unshift(S[i]);
  if (L.top >= c.max) return { kind: "up", label: "Steigern", w: round4(w + c.step), reps: c.min, goal: `Ziel: ${c.min}+ Wdh.`, c, last: L };
  const prev = S[S.length - 2];
  if (L.top < c.min && prev && prev.ww === w && prev.top < c.min)
    return { kind: "down", label: "Runter", w: round4(Math.max(0, w - c.step)), reps: c.min, goal: `Ziel: ${c.min}-${c.max} Wdh.`, c, last: L,
      note: `Zweimal unter ${c.min} Wdh. mit ${fmtW(w)} kg.` };
  const reps = Math.min(L.top + 1, c.max);
  const goal = `Ziel: ${reps} Wdh. im 1. Satz`;
  if (streak.length >= 4) {
    const early = Math.max(...streak.slice(0, -3).map(s => s.top)), late = Math.max(...streak.slice(-3).map(s => s.top));
    if (late <= early) return { kind: "stall", label: "Stagniert", w, reps, goal, c, last: L,
      note: `Seit ${streak.length} Einheiten ${fmtW(w)} kg ohne neue Bestleistung. Idee: eine Woche mit ${fmtW(round4(w * 0.9))} kg (−10 %), dann neu anlaufen.` };
  }
  return { kind: "hold", label: "Halten", w, reps, goal, c, last: L };
}

export function sparkSVG(values, W = 120, H = 30) {
  if (values.length < 2) return "";
  const p = 3, lo = Math.min(...values), hi = Math.max(...values), rg = hi - lo || 1;
  const xy = values.map((v, i) => [p + i * (W - 2 * p) / (values.length - 1), H - p - (v - lo) / rg * (H - 2 * p)]);
  const d = xy.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${d} L${lx.toFixed(1)} ${H - p} L${p} ${H - p}Z" fill="var(--accent)" fill-opacity=".14"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="var(--accent)"/></svg>`;
}

// Name → Login-Adresse für Supabase (Name + PIN statt E-Mail)
export function nameToEmail(name) {
  const bytes = new TextEncoder().encode(name.trim().toLowerCase());
  return "u" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join("") + "@bwau.app";
}
export const pinToPassword = pin => `bwau:${pin}:pin`;

// Scheiben pro Seite für eine 20-kg-Stange; null, wenn es nicht aufgeht
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export function platesPerSide(total, bar = 20) {
  let rest = (total - bar) / 2;
  if (rest < 0) return null;
  const out = [];
  for (const p of PLATES) while (rest >= p - 1e-9) { out.push(p); rest -= p }
  return rest > 1e-6 ? null : out;
}
export const isBarbell = name => /Langhantel/.test(name);

// Stufe ohne Verlauf (neue Übung): Langhantel 2,5 kg, sonst 5 kg, bei leichten Gewichten kleiner
export function defaultStep(name, w) {
  let st = /Langhantel|EZ|Kurzhantel/.test(name) ? 2.5 : 5;
  if (w > 0 && st > w * 0.15) st = w < 30 ? 2 : 2.5;
  return st;
}

// Nach einem Satz die restlichen Sätze anpassen.
// rows: [{w, r, id, manual, tr}], j: gerade abgehakter Satz, cfg: {min, max, step}
export function adjustAfterSet(rows, j, cfg) {
  const done = rows[j], w = +done.w, r = +done.r;
  let nextW = w, hint;
  if (r >= cfg.max + 2) { nextW = round4(w + cfg.step); hint = `${r} Wdh. war deutlich mehr als geplant. Nächster Satz mit ${fmtW(nextW)} kg.` }
  else if (r < cfg.min - 1 && w - cfg.step > 0) { nextW = round4(w - cfg.step); hint = `${r} Wdh. war zu schwer. Nächster Satz mit ${fmtW(nextW)} kg.` }
  const nextReps = nextW === w ? Math.max(1, r - 1) : cfg.min;
  for (const row of rows.slice(j + 1)) {
    if (row.id) continue;
    if (!row.manual) row.w = nextW;
    row.tr = nextReps;
  }
  return hint ?? null;
}

// ---------- Wochen & Streak ----------
// Montag der Woche als "JJJJ-MM-TT" (lokale Zeit)
export function weekKey(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
// dates: Startzeiten der Trainings einer Person; Streak = Wochen in Folge mit erreichtem Ziel.
// Die laufende Woche zählt mit, sobald das Ziel erreicht ist, bricht die Serie aber nicht, solange sie läuft.
export function streak(dates, goal, now = new Date()) {
  const per = new Map();
  for (const d of dates) { const k = weekKey(d); per.set(k, (per.get(k) || 0) + 1) }
  const cur = new Date(now); const thisWeek = per.get(weekKey(cur)) || 0;
  let n = thisWeek >= goal ? 1 : 0;
  const w = new Date(cur); w.setDate(w.getDate() - 7);
  while ((per.get(weekKey(w)) || 0) >= goal) { n++; w.setDate(w.getDate() - 7) }
  return { streak: n, thisWeek };
}

// ---------- Challenges ----------
// sets: [{user_id, weight, reps, performed_at}]; Gewinn = bestes 1RM im Zeitraum minus bestes 1RM davor
// (ohne Vorher-Wert zählt die erste Einheit im Zeitraum als Ausgangswert)
export function challengeStandings(ch, sets, memberIds) {
  const start = new Date(ch.starts_on + "T00:00:00"), end = new Date(ch.ends_on + "T23:59:59");
  return memberIds.map(uid => {
    const mine = sets.filter(s => s.user_id === uid && s.reps <= 15);
    const before = mine.filter(s => new Date(s.performed_at) < start);
    const inside = mine.filter(s => { const d = new Date(s.performed_at); return d >= start && d <= end })
      .sort((a, b) => new Date(a.performed_at) - new Date(b.performed_at));
    const best = list => list.length ? Math.max(...list.map(s => e1rm(+s.weight, +s.reps))) : null;
    let base = best(before);
    if (base == null && inside.length) { const first = inside[0].performed_at.slice(0, 10); base = best(inside.filter(s => s.performed_at.slice(0, 10) === first)) }
    const now = best(inside);
    const kg = base != null && now != null ? now - base : null;
    const pct = kg != null && base > 0 ? kg / base * 100 : null;
    return { user_id: uid, base, now, kg, pct, score: ch.metric === "gain_kg" ? kg : pct };
  }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

// ---------- Diagramm mit Achsen ----------
// points: [{d: Date, v: number}] → SVG mit y-Achse (kg) und erstem/letztem Datum
export function chartSVG(points, W = 340, H = 170) {
  if (points.length < 2) return "";
  const padL = 40, padR = 12, padT = 12, padB = 26;
  const vs = points.map(p => p.v), lo0 = Math.min(...vs), hi0 = Math.max(...vs);
  const step = niceStep((hi0 - lo0 || hi0 * 0.1 || 1) / 3);
  const lo = Math.floor(lo0 / step) * step, hi = Math.ceil(hi0 / step) * step || lo + step;
  const t0 = +points[0].d, t1 = +points[points.length - 1].d, span = t1 - t0 || 1;
  const x = d => padL + (+d - t0) / span * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const line = points.map((p, i) => (i ? "L" : "M") + x(p.d).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Verlauf geschätztes 1RM">
    ${ticks.map(v => `<line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${padL - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11" font-family="var(--mono)">${fmtW(v)}</text>`).join("")}
    <path d="${line} L${x(last.d).toFixed(1)} ${y(lo)} L${padL} ${y(lo)}Z" fill="var(--accent)" fill-opacity=".12"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${points.map(p => `<circle cx="${x(p.d).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.2" fill="var(--accent)"/>`).join("")}
    <circle cx="${x(last.d).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
    <text x="${padL}" y="${H - 6}" fill="var(--muted)" font-size="11" font-family="var(--mono)">${fmtD(points[0].d)}</text>
    <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="var(--muted)" font-size="11" font-family="var(--mono)">${fmtD(last.d)}</text>
  </svg>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
