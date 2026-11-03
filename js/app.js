import { createApi, DEMO } from "./api.js?v=mw132qyd";
import { VAPID_PUBLIC } from "./config.js?v=mw132qyd";
import * as L from "./logic.js?v=mw132qyd";

const $ = s => document.querySelector(s);
const view = $("#view");
const esc = L.esc;
const nSets = n => n === 1 ? "1 Satz" : `${n} Sätze`;
const nTrain = n => n === 1 ? "1 Training" : `${n} Trainings`;

// ---------- Zustand ----------
const S = {
  me: null, profile: null, profiles: [], workouts: [], sets: [], settings: new Map(), custom: [], plans: [],
  feed: null, best: null, feedMine: false, lbEx: null, progTab: null, openSettings: null,
  editPlan: null, confirm: null, error: null, importMsg: null, loading: false,
  people: {}, peopleLoading: new Set(), editWo: null, weeks: null, commentOpen: null,
  lbMode: "best", challenges: null, chData: {}, newCh: false, showAllWo: false,
};
let api;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch { } },
};
// Laufendes Training: {workoutId, title, startedAt, items:[{exercise, rows:[{w, r, id}]}]}
let active = store.get("bwau.active");
let rest = store.get("bwau.rest"); // {end, total}
const saveActive = () => store.set("bwau.active", active);
const saveRest = () => store.set("bwau.rest", rest);

const parts = () => location.hash.slice(1).split("/").map(p => { try { return decodeURIComponent(p) } catch { return p } });
const route = () => parts()[0] || "training";
const PARENT = { workout: "profil", person: "feed", uebung: "fortschritt" };
const TABS = [
  ["training", "ph-barbell", "Training"], ["fortschritt", "ph-chart-line-up", "Fortschritt"],
  ["feed", "ph-users-three", "Feed"], ["rangliste", "ph-trophy", "Rangliste"], ["profil", "ph-user-circle", "Profil"],
];

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
async function guard(fn) {
  try { S.error = null; return await fn() }
  catch (e) { S.error = e.message || String(e); render(); }
}

// ---------- Daten ----------
const woMap = () => new Map(S.workouts.map(w => [w.id, w]));
const nameOf = id => S.profiles.find(p => p.id === id)?.name || "Unbekannt";
const allExercises = () => [...new Set([...L.DEFAULT_EXERCISES, ...S.custom, ...S.sets.map(s => s.exercise)])].sort((a, b) => a.localeCompare(b, "de"));
function cfgFor(ex) {
  const s = S.settings.get(ex) || {};
  return { min: s.rep_min ?? S.profile?.rep_min ?? 6, max: s.rep_max ?? S.profile?.rep_max ?? 8, step: s.step ?? undefined, custom: !!S.settings.get(ex) };
}
function recFor(ex, history) {
  const e = history.get(ex); if (!e || !e.sessions.length) return null;
  return L.advise(e, cfgFor(ex));
}

async function loadMine() {
  const [profiles, workouts, sets, settings, custom, plans] = await Promise.all([
    api.profiles(), api.myWorkouts(), api.mySets(), api.settings(), api.customExercises(), api.plans()]);
  S.profiles = profiles; S.profile = profiles.find(p => p.id === S.me);
  S.workouts = workouts; S.sets = sets; S.custom = custom; S.plans = plans;
  S.settings = new Map(settings.map(s => [s.exercise, s]));
  S.feed = null; S.best = null;
}

// ---------- Rahmen ----------
function renderNav() {
  const nav = $("#nav"); nav.hidden = !S.me;
  if (!S.me) return;
  const r = PARENT[route()] || route();
  nav.innerHTML = TABS.map(([id, icon, label]) =>
    `<a href="#${id}" ${r === id ? 'aria-current="page"' : ""}><i class="ph ${icon}" aria-hidden="true"></i>${label}${id === "training" && active ? '<span class="dot" aria-label="Training läuft"></span>' : ""}</a>`).join("");
}

function render() {
  renderNav();
  if (!S.me) { view.innerHTML = loginView(); return }
  const r = route();
  const err = S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : "";
  let html = "";
  if (r === "training") html = S.editPlan ? planEditor() : active ? workoutView() : startView();
  else if (r === "fortschritt") html = progressView();
  else if (r === "feed") html = feedView();
  else if (r === "rangliste") html = leaderboardView();
  else if (r === "workout") html = editWorkoutView(+parts()[1]);
  else if (r === "person") html = personView(parts()[1]);
  else if (r === "uebung") html = exerciseView(parts()[1], parts()[2]);
  else html = profileView();
  view.innerHTML = err + html;
  renderTimer();
}

// ---------- Login ----------
let loginMode = "in";
function loginView() {
  const reg = loginMode === "up";
  return `<form class="login stack" id="loginForm" novalidate>
    <div class="mark">BWAU</div>
    <p class="muted">${reg ? "Neu hier? Such dir einen Namen und eine PIN aus." : "Melde dich mit deinem Namen und deiner PIN an."}</p>
    ${DEMO ? '<p class="demo">Demo-Modus: Noch keine Datenbank verbunden. Alles bleibt nur in diesem Browser.</p>' : ""}
    <label class="field" for="lname">Name<input id="lname" type="text" autocomplete="username" maxlength="20" required></label>
    <label class="field" for="lpin">PIN (4 bis 6 Ziffern)<input id="lpin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="${reg ? "new-password" : "current-password"}" maxlength="6" required></label>
    ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ""}
    <button class="btn block" type="submit">${reg ? "Registrieren" : "Anmelden"}</button>
    <button class="link" type="button" data-act="loginMode">${reg ? "Ich habe schon einen Namen" : "Neu registrieren"}</button>
  </form>`;
}
async function submitLogin() {
  const name = $("#lname").value.trim(), pin = $("#lpin").value.trim();
  if (name.length < 2) { S.error = "Der Name braucht mindestens 2 Zeichen."; return render() }
  if (!/^\d{4,6}$/.test(pin)) { S.error = "Die PIN muss aus 4 bis 6 Ziffern bestehen."; return render() }
  await guard(async () => {
    S.me = loginMode === "up" ? await api.signUp(name, pin) : await api.signIn(name, pin);
    await loadMine(); S.error = null; render();
  });
}

// ---------- Training: Start ----------
function startView() {
  const recent = []; const seen = new Set();
  for (const w of [...S.workouts].reverse()) {
    if (seen.has(w.title) || !w.ended_at) continue; seen.add(w.title);
    const n = new Set(S.sets.filter(s => s.workout_id === w.id).map(s => s.exercise)).size;
    if (n) recent.push({ w, n });
    if (recent.length >= 4) break;
  }
  const mine = S.plans.filter(p => p.user_id === S.me), others = S.plans.filter(p => p.user_id !== S.me);
  const planCard = p => `<div class="card">
      <div class="spread"><h3>${esc(p.name)}</h3>${p.user_id !== S.me ? `<span class="small muted">von ${esc(nameOf(p.user_id))}</span>` : p.shared ? '<span class="chip">Geteilt</span>' : ""}</div>
      <p class="small muted">${p.items.map(i => esc(i.exercise)).join(", ") || "Noch keine Übungen"}</p>
      <div class="row">
        <button class="btn" data-act="startPlan" data-id="${p.id}" ${p.items.length ? "" : "disabled"}><i class="ph ph-play"></i>Starten</button>
        ${p.user_id === S.me ? `<button class="btn quiet" data-act="editPlan" data-id="${p.id}"><i class="ph ph-pencil-simple"></i>Bearbeiten</button>`
                             : `<button class="btn quiet" data-act="copyPlan" data-id="${p.id}"><i class="ph ph-copy"></i>Übernehmen</button>`}
      </div></div>`;
  return `<div class="top"><h1>Training</h1><span class="mark">BWAU</span></div>
    <div class="stack">
      ${recent.map(({ w, n }) => `<button class="card" style="text-align:left;cursor:pointer" data-act="repeat" data-id="${w.id}">
        <div class="spread"><h3>${esc(w.title)} wiederholen</h3><i class="ph ph-caret-right muted"></i></div>
        <p class="small muted">${n} Übungen, zuletzt ${L.fmtDT(w.started_at)}</p></button>`).join("")}
      <button class="btn ghost block" data-act="startEmpty"><i class="ph ph-plus"></i>Leeres Training</button>
    </div>
    <div class="spread"><h2>Pläne</h2><button class="link" data-act="newPlan"><i class="ph ph-plus"></i> Neuer Plan</button></div>
    ${mine.length ? `<div class="stack">${mine.map(planCard).join("")}</div>` : `<div class="empty">Du hast noch keinen Plan. Ein Plan legt fest, welche Übungen mit wie vielen Sätzen dran sind.<button class="btn quiet" data-act="newPlan">Plan anlegen</button></div>`}
    ${others.length ? `<h2>Von deinen Freunden</h2><div class="stack">${others.map(planCard).join("")}</div>` : ""}`;
}

function makeItems(list) {
  const h = L.historyByExercise(S.sets, woMap());
  return list.map(({ exercise, sets }) => {
    const rec = recFor(exercise, h);
    const n = sets || rec?.last.sets.length || 3;
    return { exercise, rows: Array.from({ length: n }, () => ({ w: rec ? rec.w : "", r: "", id: null })) };
  });
}
async function startWorkout(title, list) {
  await guard(async () => {
    const wo = await api.startWorkout(title);
    S.workouts.push(wo);
    active = { workoutId: wo.id, title, startedAt: wo.started_at, items: makeItems(list) };
    saveActive(); keepAwake(); render(); scrollTo(0, 0);
  });
}

// ---------- Training: Logger ----------
const elapsed = from => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(from)) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")} h` : `${m}:${String(sec).padStart(2, "0")}`;
};
function platesHTML(ex, w) {
  if (!L.isBarbell(ex) || !(w > 20)) return "";
  const p = L.platesPerSide(w); if (!p) return "";
  const cls = x => x === 2.5 ? "p2" : x === 1.25 ? "p1" : "p" + x;
  return `<div class="plates" title="Scheiben pro Seite bei 20-kg-Stange">pro Seite ${p.map(x => `<b class="${cls(x)}">${L.fmtW(x)}</b>`).join("")}</div>`;
}
function workoutView() {
  const h = L.historyByExercise(S.sets, woMap(), active.workoutId);
  const doneCount = active.items.reduce((n, it) => n + it.rows.filter(r => r.id).length, 0);
  const cards = active.items.map((it, i) => {
    const rec = recFor(it.exercise, h);
    const last = rec?.last;
    return `<section class="card ${rec ? "k " + rec.kind : ""}">
      <div class="spread"><h3>${esc(it.exercise)}</h3>${rec ? `<span class="chip ${rec.kind}">${chipIcon(rec.kind)}${rec.label}</span>` : '<span class="chip">Neu</span>'}</div>
      ${last ? `<p class="lastline num">Zuletzt ${L.fmtD(last.d)}: ${last.sets.map(s => `${L.fmtW(s.w)}×${s.r}`).join(", ")}</p>` : '<p class="small muted">Noch kein Verlauf. Trag einfach ein, was du schaffst.</p>'}
      ${rec ? `<div class="target"><span class="big num">${L.fmtW(rec.w)}<small>kg</small></span><span class="small"><b>${rec.goal}</b></span>${platesHTML(it.exercise, rec.w)}</div>` : ""}
      ${rec?.note ? `<p class="note">${esc(rec.note)}</p>` : ""}
      ${it.hint ? `<p class="small" role="status"><i class="ph ph-lightning"></i> ${esc(it.hint)}</p>` : ""}
      <div class="sets num">
        <span class="h">Satz</span><span class="h">kg</span><span class="h">Wdh.</span><span></span>
        ${it.rows.map((r, j) => `
          <span class="i">${j + 1}</span>
          <input id="w-${i}-${j}" type="number" inputmode="decimal" step="0.25" min="0" value="${r.w}" data-i="${i}" data-j="${j}" data-f="w" aria-label="Gewicht Satz ${j + 1}" class="${r.id ? "done" : ""}" ${r.id ? "readonly" : ""}>
          <input id="r-${i}-${j}" type="number" inputmode="numeric" min="1" value="${r.r}" placeholder="${r.tr ?? (rec ? rec.reps : "")}" data-i="${i}" data-j="${j}" data-f="r" aria-label="Wiederholungen Satz ${j + 1}" class="${r.id ? "done" : ""}" ${r.id ? "readonly" : ""}>
          <button class="tick ${r.id ? "on" : ""}" data-act="tick" data-i="${i}" data-j="${j}" aria-label="${r.id ? "Satz ${j + 1} zurücknehmen" : "Satz ${j + 1} abhaken"}" aria-pressed="${!!r.id}"><i class="ph ph-check"></i></button>`).join("")}
      </div>
      <div class="spread">
        <button class="link" data-act="addRow" data-i="${i}"><i class="ph ph-plus"></i> Satz</button>
        <button class="link" data-act="removeEx" data-i="${i}" style="color:var(--muted)">Übung entfernen</button>
      </div>
    </section>`;
  }).join("");
  const discard = S.confirm === "discard";
  return `<div class="top"><div><h1>${esc(active.title)}</h1><p class="muted num"><span id="elapsed">${elapsed(active.startedAt)}</span>, ${nSets(doneCount)} erledigt</p></div>
      <button class="btn" data-act="finish"><i class="ph ph-check"></i>Beenden</button></div>
    ${cards || '<div class="empty">Noch keine Übung. Füg unten die erste hinzu.</div>'}
    <form class="card" id="addExForm">
      <label class="field" for="newEx">Übung hinzufügen<input id="newEx" type="text" list="exlist" autocomplete="off" placeholder="z. B. Latzug (Kabel)"></label>
      <datalist id="exlist">${allExercises().map(e => `<option value="${esc(e)}">`).join("")}</datalist>
      <button class="btn quiet" type="submit"><i class="ph ph-plus"></i>Hinzufügen</button>
    </form>
    ${discard ? `<div class="card"><p>Training wirklich verwerfen? Alle Sätze daraus werden gelöscht.</p>
        <div class="row"><button class="btn danger" data-act="discardYes">Verwerfen</button><button class="btn quiet" data-act="confirmNo">Behalten</button></div></div>`
      : `<button class="link" data-act="discard" style="color:var(--down)"><i class="ph ph-trash"></i> Training verwerfen</button>`}`;
}
const chipIcon = k => k === "up" ? '<i class="ph ph-arrow-up"></i> ' : k === "down" ? '<i class="ph ph-arrow-down"></i> ' : k === "stall" ? '<i class="ph ph-warning"></i> ' : "";

async function tick(i, j) {
  const it = active.items[i], row = it.rows[j];
  if (row.id) {
    await guard(async () => { await api.deleteSet(row.id); S.sets = S.sets.filter(s => s.id !== row.id); row.id = null; saveActive(); render() });
    return;
  }
  const wIn = $(`#w-${i}-${j}`), rIn = $(`#r-${i}-${j}`);
  const w = parseFloat(String(wIn.value).replace(",", ".")), r = parseInt(rIn.value || rIn.placeholder, 10);
  if (!(w >= 0)) { toast("Trag zuerst das Gewicht ein."); wIn.focus(); return }
  if (!(r > 0)) { toast("Trag zuerst die Wiederholungen ein."); rIn.focus(); return }
  row.w = w; row.r = r;
  await guard(async () => {
    const s = await api.addSet({ workout_id: active.workoutId, exercise: it.exercise, set_index: j, weight: w, reps: r });
    row.id = s.id; S.sets.push(s); saveActive();
    // Restliche Sätze an die gerade geschaffte Leistung anpassen
    const rec = recFor(it.exercise, L.historyByExercise(S.sets, woMap(), active.workoutId));
    const c = cfgFor(it.exercise);
    it.hint = L.adjustAfterSet(it.rows, j, { min: c.min, max: c.max, step: rec?.c.step ?? c.step ?? L.defaultStep(it.exercise, w) });
    saveActive();
    startRest(S.profile?.rest_seconds ?? 120);
    render();
  });
}

async function finishWorkout() {
  const n = active.items.reduce((a, it) => a + it.rows.filter(r => r.id).length, 0);
  if (!n) { S.confirm = "discard"; render(); return }
  await guard(async () => {
    await api.finishWorkout(active.workoutId);
    const t = active.title; active = null; saveActive(); rest = null; saveRest(); syncRestPush(); releaseAwake();
    await loadMine(); render(); scrollTo(0, 0);
    toast(`${t} gespeichert: ${nSets(n)}`);
  });
}
async function discardWorkout() {
  await guard(async () => {
    await api.deleteWorkout(active.workoutId);
    active = null; saveActive(); rest = null; saveRest(); syncRestPush(); S.confirm = null; releaseAwake();
    await loadMine(); render();
  });
}

// ---------- Pausen-Timer ----------
let audio;
function unlockAudio() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)() } catch { }
}
function beep() {
  if (!audio) return;
  try {
    audio.resume?.();
    [0, 0.22, 0.44].forEach((t, k) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = k === 2 ? 1046 : 784; o.connect(g); g.connect(audio.destination);
      const at = audio.currentTime + t;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      o.start(at); o.stop(at + 0.2);
    });
  } catch { }
  navigator.vibrate?.([200, 100, 200]);
}
function startRest(sec) { rest = { end: Date.now() + sec * 1000, total: sec, beeped: false }; saveRest(); renderTimer(); syncRestPush() }
function renderTimer() {
  const el = $("#timer");
  if (!rest || !S.me) { el.hidden = true; return }
  const left = Math.round((rest.end - Date.now()) / 1000);
  if (left <= 0 && !rest.beeped) { rest.beeped = true; saveRest(); beep() }
  if (left < -8) { rest = null; saveRest(); el.hidden = true; return }
  el.hidden = false;
  el.classList.toggle("over", left <= 0);
  const pct = Math.max(0, Math.min(100, left / rest.total * 100));
  const t = Math.max(0, left), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, "0");
  const html = left <= 0
    ? `<div class="in"><i class="ph ph-timer" style="font-size:24px"></i><span class="t">Los</span><span style="flex:1">Pause vorbei, nächster Satz.</span><button data-act="restSkip" aria-label="Schließen"><i class="ph ph-x"></i></button></div>`
    : `<div class="in"><span class="t num">${mm}:${ss}</span><div class="bar"><i style="width:${pct}%"></i></div>
       <button data-act="restAdd" data-d="-15" aria-label="15 Sekunden weniger">−15</button><button data-act="restAdd" data-d="15" aria-label="15 Sekunden mehr">+15</button>
       <button data-act="restSkip" aria-label="Pause überspringen"><i class="ph ph-skip-forward"></i></button></div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html }
}

// Bildschirm während des Trainings anlassen (wo der Browser es erlaubt)
let wake = null;
async function keepAwake() { try { if (active && !wake && document.visibilityState === "visible") { wake = await navigator.wakeLock?.request("screen"); wake?.addEventListener("release", () => (wake = null)) } } catch { } }
function releaseAwake() { try { wake?.release() } catch { } wake = null }

// ---------- Pläne ----------
function planEditor() {
  const p = S.editPlan;
  return `<div class="top"><h1>${p.id ? "Plan bearbeiten" : "Neuer Plan"}</h1></div>
  <form class="card" id="planForm">
    <label class="field" for="pname">Name<input id="pname" type="text" maxlength="40" value="${esc(p.name)}" placeholder="z. B. Push" required></label>
    <div class="stack">
      ${p.items.map((it, k) => `<div class="row" style="flex-wrap:nowrap">
        <label class="field" for="pex-${k}" style="flex:1;min-width:0">Übung ${k + 1}<input id="pex-${k}" type="text" list="exlist" value="${esc(it.exercise)}" data-k="${k}" data-pf="exercise" autocomplete="off"></label>
        <label class="field" for="pst-${k}" style="width:5.5em">Sätze<input id="pst-${k}" type="number" min="1" max="10" value="${it.sets}" data-k="${k}" data-pf="sets"></label>
        <button type="button" class="tick" style="align-self:flex-end" data-act="planDel" data-k="${k}" aria-label="Übung ${k + 1} entfernen"><i class="ph ph-x"></i></button>
      </div>`).join("")}
      <datalist id="exlist">${allExercises().map(e => `<option value="${esc(e)}">`).join("")}</datalist>
      <button type="button" class="btn quiet" data-act="planAdd"><i class="ph ph-plus"></i>Übung</button>
    </div>
    <label class="check" for="pshared"><input id="pshared" type="checkbox" ${p.shared ? "checked" : ""}> Mit Freunden teilen</label>
    <div class="row"><button class="btn" type="submit">Speichern</button><button type="button" class="btn quiet" data-act="planCancel">Abbrechen</button></div>
  </form>
  ${p.id ? (S.confirm === "deletePlan"
    ? `<div class="card"><p>Plan „${esc(p.name)}“ löschen?</p><div class="row"><button class="btn danger" data-act="planDeleteYes">Löschen</button><button class="btn quiet" data-act="confirmNo">Behalten</button></div></div>`
    : `<button class="link" data-act="planDelete" style="color:var(--down)"><i class="ph ph-trash"></i> Plan löschen</button>`) : ""}`;
}
function readPlanForm() {
  const p = S.editPlan;
  p.name = $("#pname")?.value ?? p.name; p.shared = $("#pshared")?.checked ?? p.shared;
  document.querySelectorAll("[data-pf]").forEach(inp => { const it = p.items[+inp.dataset.k]; if (it) it[inp.dataset.pf] = inp.dataset.pf === "sets" ? Math.max(1, parseInt(inp.value, 10) || 3) : inp.value });
}
async function savePlan() {
  readPlanForm();
  const p = S.editPlan;
  p.items = p.items.map(i => ({ exercise: i.exercise.trim(), sets: i.sets })).filter(i => i.exercise);
  if (!p.name.trim()) { S.error = "Gib dem Plan einen Namen."; return render() }
  await guard(async () => {
    for (const i of p.items) if (!allExercises().includes(i.exercise)) { await api.addExercise(i.exercise); S.custom.push(i.exercise) }
    await api.savePlan({ ...p, name: p.name.trim() });
    S.editPlan = null; S.plans = await api.plans(); render(); toast("Plan gespeichert");
  });
}

// ---------- Fortschritt ----------
function progressView() {
  const h = L.historyByExercise(S.sets, woMap(), active?.workoutId);
  const list = [...h.values()];
  if (!list.length) return `<h1>Fortschritt</h1><div class="empty">Hier erscheinen deine Empfehlungen, sobald du trainiert hast. Du kannst auch deine alten Hevy-Daten im Profil importieren.<a class="btn quiet" href="#profil">Zum Profil</a></div>`;
  const newest = Math.max(...list.map(e => e.sessions.at(-1).d));
  list.forEach(e => { e.adv = L.advise(e, cfgFor(e.name)); e.last = e.sessions.at(-1) });
  const recent = list.filter(e => (newest - e.last.d) / 864e5 <= 45), old = list.filter(e => !recent.includes(e));
  const titles = [];
  [...S.workouts].reverse().forEach(w => { if (!titles.includes(w.title) && recent.some(e => e.last.title === w.title)) titles.push(w.title) });
  if (!S.progTab || (S.progTab !== "*" && !titles.includes(S.progTab))) S.progTab = titles[0] || "*";
  const order = { up: 0, down: 1, stall: 2, hold: 3 };
  const shown = recent.filter(e => S.progTab === "*" || e.last.title === S.progTab).sort((a, b) => order[a.adv.kind] - order[b.adv.kind] || b.last.d - a.last.d);
  const t = { up: 0, hold: 0, stall: 0, down: 0 }; shown.forEach(e => t[e.adv.kind]++);
  return `<h1>Fortschritt</h1>
    <div class="tally">${[["up", "Steigern"], ["hold", "Halten"], ["stall", "Stagniert"], ["down", "Runter"]].map(([k, l]) => `<div class="t-${k}"><b class="num">${t[k]}</b><span>${l}</span></div>`).join("")}</div>
    <div class="pills" role="group" aria-label="Training wählen">${[...titles, "*"].map(x => `<button class="pill" data-act="progTab" data-v="${esc(x)}" aria-pressed="${S.progTab === x}">${x === "*" ? "Alle" : esc(x)}</button>`).join("")}</div>
    <div class="stack">${shown.map(progressCard).join("")}</div>
    ${old.length ? `<details><summary>Länger als 45 Tage nicht gemacht (${old.length})</summary><div class="stack" style="margin-top:8px">${old.sort((a, b) => b.last.d - a.last.d).map(progressCard).join("")}</div></details>` : ""}
    <p class="small muted">Steigern, wenn dein bester Satz das obere Ende des Bereichs erreicht. Runter nach zweimal unter dem unteren Ende. Stagniert nach 4 Einheiten ohne neue Bestleistung beim selben Gewicht.</p>`;
}
function progressCard(e) {
  const a = e.adv, L1 = e.last, open = S.openSettings === e.name, c = cfgFor(e.name);
  const prevBest = Math.max(0, ...e.sessions.slice(0, -1).map(s => s.e1));
  const pr = e.sessions.length > 1 && L1.e1 > prevBest + 0.01;
  const key = encodeURIComponent(e.name);
  return `<article class="card k ${a.kind}">
    <div class="spread"><h3><a href="${exLink(S.me, e.name)}">${esc(e.name)}</a></h3><span class="chip ${a.kind}">${chipIcon(a.kind)}${a.label}</span></div>
    <p class="lastline num">Zuletzt ${L.fmtD(L1.d)}: ${L1.sets.map(s => `${L.fmtW(s.w)}×${s.r}`).join(", ")}</p>
    <div class="target"><span class="big num">${L.fmtW(a.w)}<small>kg</small></span><span class="small"><b>${a.goal}</b></span>${platesHTML(e.name, a.w)}</div>
    ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
    <div class="spread"><div class="spark">${L.sparkSVG(e.sessions.slice(-12).map(s => s.e1))}<span>ca. ${Math.round(L1.e1)} kg 1RM</span>${pr ? '<span class="pr">Rekord</span>' : ""}</div>
      <button class="link" data-act="openSettings" data-v="${key}" aria-expanded="${open}" style="color:var(--muted)">Anpassen${c.custom ? " (eigene Werte)" : ""}</button></div>
    ${open ? `<div class="settings" data-ex="${key}">
      <label class="field" for="smin">Wdh. min<input id="smin" type="number" min="1" max="30" value="${c.min}" data-s="rep_min"></label>
      <label class="field" for="smax">Wdh. max<input id="smax" type="number" min="1" max="50" value="${c.max}" data-s="rep_max"></label>
      <label class="field" for="sstep">Stufe kg<input id="sstep" type="number" min="0.5" max="20" step="0.25" value="${a.c.step}" data-s="step"></label>
      ${c.custom ? `<button class="link" data-act="resetSettings" data-v="${key}">Zurücksetzen</button>` : ""}</div>` : ""}
  </article>`;
}

// ---------- Feed ----------
function initials(n) { return esc((n || "?").trim().slice(0, 1).toUpperCase()) }
function feedView() {
  if (!S.feed) { loadFeed(); return `<h1>Feed</h1><p class="muted">Lädt die letzten Trainings …</p>` }
  const best = new Set((S.best || []).map(b => b.user_id + "|" + b.exercise + "|" + b.workout_id));
  const list = S.feed.filter(w => !S.feedMine || w.user_id === S.me).filter(w => w.sets.length || !w.ended_at);
  const card = w => {
    const by = new Map();
    for (const s of w.sets) { const b = by.get(s.exercise); if (!b || L.e1rm(s.weight, s.reps) > L.e1rm(b.weight, b.reps)) by.set(s.exercise, s) }
    const live = !w.ended_at && Date.now() - new Date(w.started_at) < 4 * 3600e3;
    const mins = w.ended_at ? Math.round((new Date(w.ended_at) - new Date(w.started_at)) / 60000) : null;
    const rows = [...by.values()];
    return `<article class="card">
      <div class="spread"><a class="who" href="#person/${w.user_id}"><span class="av ${w.user_id === S.me ? "me" : ""}">${initials(nameOf(w.user_id))}</span>
        <div><h3>${esc(nameOf(w.user_id))}</h3><p class="small muted">${esc(w.title)}, ${L.fmtDT(w.started_at)}${mins ? `, ${mins} min` : ""}</p></div></a>
        ${live ? '<span class="chip live">Trainiert gerade</span>' : `<span class="small muted num">${nSets(w.sets.length)}</span>`}</div>
      ${rows.length ? `<div class="lifts num">${rows.slice(0, 6).map(s => `<span><a href="${exLink(w.user_id, s.exercise)}">${esc(s.exercise)}</a>${best.has(w.user_id + "|" + s.exercise + "|" + w.id) ? ' <span class="pr">Rekord</span>' : ""}</span><span>${L.fmtW(s.weight)} kg × ${s.reps}</span>`).join("")}</div>
        ${rows.length > 6 ? `<p class="small muted">und ${rows.length - 6} weitere Übungen</p>` : ""}` : ""}
      ${socialHTML(w)}
    </article>`;
  };
  return `<h1>Feed</h1>
    ${weekStrip()}
    <div class="pills"><button class="pill" data-act="feedMine" data-v="0" aria-pressed="${!S.feedMine}">Alle</button><button class="pill" data-act="feedMine" data-v="1" aria-pressed="${S.feedMine}">Nur ich</button></div>
    ${list.length ? `<div class="stack">${list.map(card).join("")}</div>` : `<div class="empty">Noch keine Trainings. Sobald jemand ein Training beendet, taucht es hier auf.</div>`}`;
}
async function loadFeed() {
  await guard(async () => { [S.feed, S.best, S.profiles, S.weeks] = await Promise.all([api.feed(), api.bestLifts(), api.profiles(), api.weekWorkouts(new Date(Date.now() - 400 * 864e5).toISOString())]); if (route() === "feed") render() });
}

// ---------- Rangliste ----------
function leaderboardView() {
  const modes = `<div class="pills"><button class="pill" data-act="lbMode" data-v="best" aria-pressed="${S.lbMode === "best"}">Bestenliste</button><button class="pill" data-act="lbMode" data-v="ch" aria-pressed="${S.lbMode === "ch"}">Challenges</button></div>`;
  return `<h1>Rangliste</h1>${modes}` + (S.lbMode === "ch" ? challengesView() : bestView());
}
function bestView() {
  if (!S.best) { loadBest(); return `<p class="muted">Lädt …</p>` }
  const byEx = new Map();
  S.best.forEach(b => { (byEx.get(b.exercise) ?? byEx.set(b.exercise, []).get(b.exercise)).push(b) });
  if (!byEx.size) return `<div class="empty">Noch keine Sätze eingetragen. Die Rangliste füllt sich mit dem ersten Training.</div>`;
  const exs = [...byEx.keys()].sort((a, b) => byEx.get(b).length - byEx.get(a).length || a.localeCompare(b, "de"));
  if (!S.lbEx || !byEx.has(S.lbEx)) S.lbEx = exs.find(e => /^Bankdrücken \(Langhantel\)$/.test(e)) || exs[0];
  const rows = byEx.get(S.lbEx).sort((a, b) => b.e1rm - a.e1rm);
  return `
    <label class="field" for="lbEx">Übung<select id="lbEx">${exs.map(e => `<option value="${esc(e)}" ${e === S.lbEx ? "selected" : ""}>${esc(e)} (${byEx.get(e).length})</option>`).join("")}</select></label>
    <div class="card" style="gap:0">${rows.map((r, k) => `<a class="rank ${k === 0 ? "first" : ""} ${r.user_id === S.me ? "mine" : ""}" href="${exLink(r.user_id, r.exercise)}">
        <span class="pos num">${k + 1}</span><span class="av ${r.user_id === S.me ? "me" : ""}">${initials(nameOf(r.user_id))}</span>
        <div style="min-width:0"><h3>${esc(nameOf(r.user_id))}</h3><p class="small muted num">${L.fmtW(r.weight)} kg × ${r.reps}, ${L.fmtD(r.performed_at)}</p></div>
        <div class="val num"><b>${L.fmtW(Math.round(r.e1rm))}</b> <span class="small muted">kg</span></div></a>`).join("")}</div>
    <p class="small muted">Geschätztes Maximalgewicht für 1 Wiederholung (1RM), berechnet aus dem besten Satz mit bis zu 15 Wiederholungen.</p>`;
}
async function loadBest() { await guard(async () => { [S.best, S.profiles] = await Promise.all([api.bestLifts(), api.profiles()]); if (route() === "rangliste") render() }) }

// ---------- Profil ----------
function profileView() {
  const p = S.profile || {};
  const n = S.workouts.filter(w => w.ended_at).length;
  return `<div class="top"><div><h1>${esc(p.name)}</h1><p class="muted">${nTrain(n)}, ${nSets(S.sets.length)}</p></div><span class="av me" style="width:48px;height:48px;font-size:1.4rem">${initials(p.name)}</span></div>
    ${(() => { const st = L.streak(S.workouts.filter(w => w.ended_at).map(w => w.started_at), p.weekly_goal ?? 3); return `<div class="card"><div class="spread"><h3>Diese Woche</h3>${streakBadge(st.streak)}</div>${pips(st.thisWeek, p.weekly_goal ?? 3)}</div>` })()}
    ${DEMO ? '<p class="demo">Demo-Modus: Noch keine Datenbank verbunden. Daten bleiben nur in diesem Browser, Freunde sehen sie nicht.</p>' : ""}
    <form class="card" id="profileForm">
      <h2>Einstellungen</h2>
      <div class="row" style="align-items:flex-end">
        <label class="field" for="prmin" style="width:7em">Wdh. min<input id="prmin" type="number" min="1" max="30" value="${p.rep_min ?? 6}"></label>
        <label class="field" for="prmax" style="width:7em">Wdh. max<input id="prmax" type="number" min="1" max="50" value="${p.rep_max ?? 8}"></label>
        <label class="field" for="prrest" style="width:8em">Pause (Sek.)<input id="prrest" type="number" min="15" max="600" step="15" value="${p.rest_seconds ?? 120}"></label>
        <label class="field" for="prgoal" style="width:8em">Wochenziel<input id="prgoal" type="number" min="1" max="7" value="${p.weekly_goal ?? 3}"></label>
        <label class="field" for="prbw" style="width:8em">Körpergewicht<input id="prbw" type="number" min="30" max="250" step="0.1" value="${p.bodyweight ?? ""}" placeholder="kg"></label>
      </div>
      <p class="small muted">Der Wiederholungsbereich gilt für alle Übungen, außer du stellst ihn unter Fortschritt pro Übung anders ein.</p>
      <button class="btn" type="submit">Speichern</button>
    </form>
    ${pushCard()}
    ${myWorkoutsCard()}
    <div class="card">
      <h2>Hevy-Daten importieren</h2>
      <p class="small muted">In Hevy unter Profil, Einstellungen, Daten exportieren die CSV holen und hier auswählen. Schon importierte Trainings werden übersprungen.</p>
      <label class="btn quiet" for="hevyFile" style="align-self:flex-start"><i class="ph ph-upload-simple"></i>CSV auswählen<input id="hevyFile" type="file" accept=".csv,text/csv" hidden></label>
      ${S.importMsg ? `<p class="small" role="status">${esc(S.importMsg)}</p>` : ""}
    </div>
    <form class="card" id="pinForm">
      <h2>PIN ändern</h2>
      <label class="field" for="newPin">Neue PIN (4 bis 6 Ziffern)<input id="newPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
      <button class="btn quiet" type="submit" style="align-self:flex-start">PIN ändern</button>
    </form>
    <div class="card">
      <h2>Auf den Home-Bildschirm</h2>
      <p class="small muted">In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“. Dann startet BWAU wie eine App im Vollbild.</p>
    </div>
    <button class="btn danger" data-act="logout"><i class="ph ph-sign-out"></i>Abmelden</button>`;
}
function myWorkoutsCard() {
  const list = S.workouts.filter(w => w.ended_at).slice().reverse();
  if (!list.length) return "";
  const shown = S.showAllWo ? list : list.slice(0, 8);
  const count = id => S.sets.filter(s => s.workout_id === id).length;
  return `<div class="card"><h2>Meine Trainings</h2>
    <div class="wolist">${shown.map(w => `<a href="#workout/${w.id}"><span>${esc(w.title)} <span class="small muted">${L.fmtDT(w.started_at)}</span></span><span class="small muted num">${nSets(count(w.id))} <i class="ph ph-pencil-simple"></i></span></a>`).join("")}</div>
    ${list.length > 8 ? `<button class="link" data-act="showAllWo">${S.showAllWo ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`}</button>` : ""}</div>`;
}
async function importHevy(file) {
  S.importMsg = "Lese Datei …"; render();
  await guard(async () => {
    const text = await file.text();
    const list = L.hevyToWorkouts(L.parseCSV(text));
    if (!list.length) throw new Error("In der Datei wurden keine Sätze mit Gewicht und Wiederholungen gefunden.");
    const res = await api.importWorkouts(list, (d, t) => { S.importMsg = `Importiere ${d} von ${t} Trainings …`; render() });
    await loadMine();
    S.importMsg = res.added ? `${res.added} Trainings importiert${res.skipped ? `, ${res.skipped} waren schon da` : ""}.` : "Alle Trainings aus der Datei waren schon da.";
    render();
  });
  if (S.error) { S.importMsg = null; render() }
}

// ---------- Unterseiten: Hilfen ----------
const backLink = fallback => `<button class="link back" data-act="back" data-v="${fallback}"><i class="ph ph-caret-left"></i> Zurück</button>`;
const exLink = (uid, ex) => `#uebung/${uid}/${encodeURIComponent(ex)}`;
const localISO = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}` };
// Trainingsdaten einer Person (eigene sofort, andere werden nachgeladen)
function dataFor(uid) {
  if (uid === S.me) return { workouts: S.workouts, sets: S.sets };
  if (S.people[uid]) return S.people[uid];
  if (!S.peopleLoading.has(uid)) {
    S.peopleLoading.add(uid);
    guard(async () => { const [workouts, sets] = await Promise.all([api.userWorkouts(uid), api.userSets(uid)]); S.people[uid] = { workouts, sets }; S.peopleLoading.delete(uid); render() });
  }
  return null;
}

// ---------- Übungsseite ----------
function exerciseView(uid, ex) {
  const d = dataFor(uid);
  if (!d) return `${backLink("fortschritt")}<p class="muted">Lädt …</p>`;
  const h = L.historyByExercise(d.sets, new Map(d.workouts.map(w => [w.id, w])), uid === S.me ? active?.workoutId : undefined);
  const e = h.get(ex);
  if (!e) return `${backLink("fortschritt")}<h1 class="h1s">${esc(ex)}</h1><div class="empty">Zu dieser Übung gibt es noch keine Sätze.</div>`;
  let best = 0; const prs = [];
  for (const s of e.sessions) if (s.e1 > best + 0.01) { best = s.e1; prs.push(s) }
  let top = null;
  for (const s of e.sessions) for (const x of s.sets) if (x.r <= 15 && (!top || L.e1rm(x.w, x.r) > L.e1rm(top.w, top.r))) top = { ...x, d: s.d };
  const rec = uid === S.me ? L.advise(e, cfgFor(ex)) : null;
  const who = uid === S.me ? "" : `<p class="muted">von <a href="#person/${uid}">${esc(nameOf(uid))}</a></p>`;
  return `${backLink(uid === S.me ? "fortschritt" : "person/" + uid)}
    <div><h1 class="h1s">${esc(ex)}</h1>${who}</div>
    <div class="stats num">
      <div><b>${Math.round(best)}</b><span>kg 1RM geschätzt</span></div>
      ${top ? `<div><b>${L.fmtW(top.w)}×${top.r}</b><span>bester Satz</span></div>` : ""}
      <div><b>${e.sessions.length}</b><span>Einheiten</span></div>
    </div>
    ${rec ? `<div class="card k ${rec.kind}"><div class="spread"><h3>Nächstes Mal</h3><span class="chip ${rec.kind}">${chipIcon(rec.kind)}${rec.label}</span></div>
      <div class="target"><span class="big num">${L.fmtW(rec.w)}<small>kg</small></span><span class="small"><b>${rec.goal}</b></span>${platesHTML(ex, rec.w)}</div></div>` : ""}
    ${e.sessions.length > 1 ? `<div class="card"><h3>Verlauf</h3>${L.chartSVG(e.sessions.map(s => ({ d: s.d, v: s.e1 })))}<p class="small muted">Geschätztes 1RM pro Einheit</p></div>` : ""}
    <div class="card"><h3>Rekorde</h3><div class="lifts num">${prs.slice().reverse().slice(0, 6).map(s => `<span>${L.fmtD(s.d)}</span><span>ca. ${Math.round(s.e1)} kg</span>`).join("")}</div></div>
    <div class="card"><h3>Alle Einheiten</h3><div class="lifts num">${e.sessions.slice().reverse().map(s => `<span>${L.fmtD(s.d)} <span class="muted small">${esc(s.title)}</span></span><span>${s.sets.map(x => `${L.fmtW(x.w)}×${x.r}`).join(", ")}</span>`).join("")}</div></div>`;
}

// ---------- Profil der anderen ----------
function personView(uid) {
  const p = S.profiles.find(x => x.id === uid);
  const d = dataFor(uid);
  if (!d) return `${backLink("feed")}<p class="muted">Lädt …</p>`;
  const done = d.workouts.filter(w => w.ended_at);
  const st = L.streak(done.map(w => w.started_at), p?.weekly_goal ?? 3);
  const h = L.historyByExercise(d.sets, new Map(d.workouts.map(w => [w.id, w])));
  const lifts = [...h.values()].sort((a, b) => b.sessions.length - a.sessions.length).slice(0, 8)
    .map(e => ({ name: e.name, e1: Math.max(...e.sessions.map(s => s.e1)) }));
  const plans = S.plans.filter(x => x.user_id === uid && x.shared);
  const setsOf = id => d.sets.filter(s => s.workout_id === id).length;
  return `${backLink("feed")}
    <div class="top"><div><h1>${esc(p?.name || "Unbekannt")}</h1><p class="muted">${nTrain(done.length)}${uid === S.me ? ", das bist du" : ""}</p></div>
      <span class="av ${uid === S.me ? "me" : ""}" style="width:48px;height:48px;font-size:1.4rem">${initials(p?.name)}</span></div>
    <div class="card"><div class="spread"><h3>Diese Woche</h3>${streakBadge(st.streak)}</div>${pips(st.thisWeek, p?.weekly_goal ?? 3)}</div>
    ${lifts.length ? `<div class="card"><h3>Meistgemachte Übungen</h3><div class="lifts num">${lifts.map(l => `<span><a href="${exLink(uid, l.name)}">${esc(l.name)}</a></span><span>ca. ${Math.round(l.e1)} kg</span>`).join("")}</div></div>` : ""}
    ${done.length ? `<div class="card"><h3>Letzte Trainings</h3><div class="lifts num">${done.slice(-5).reverse().map(w => `<span>${esc(w.title)} <span class="muted small">${L.fmtDT(w.started_at)}</span></span><span>${nSets(setsOf(w.id))}</span>`).join("")}</div></div>` : ""}
    ${plans.length && uid !== S.me ? `<div class="card"><h3>Geteilte Pläne</h3>${plans.map(pl => `<div class="spread"><span>${esc(pl.name)}</span><button class="btn quiet" data-act="copyPlan" data-id="${pl.id}"><i class="ph ph-copy"></i>Übernehmen</button></div>`).join("")}</div>` : ""}`;
}
const pips = (n, goal) => `<div class="pips" aria-label="${n} von ${goal} Trainings">${Array.from({ length: Math.max(goal, n) }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("")}<span class="small muted num">${n} von ${goal}</span></div>`;
const streakBadge = n => n > 0 ? `<span class="streak num"><i class="ph ph-fire"></i>${n} ${n === 1 ? "Woche" : "Wochen"}</span>` : `<span class="small muted">Noch keine Serie</span>`;

// ---------- Training bearbeiten ----------
function buildEditWo(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return null;
  const groups = [];
  for (const s of S.sets.filter(s => s.workout_id === id).sort((a, b) => a.id - b.id)) {
    let g = groups.find(g => g.exercise === s.exercise);
    if (!g) groups.push(g = { exercise: s.exercise, rows: [] });
    g.rows.push({ id: s.id, w: s.weight, r: s.reps, w0: s.weight, r0: s.reps, del: false });
  }
  return { id, title: w.title, groups };
}
function editWorkoutView(id) {
  if (active?.workoutId === id) return `${backLink("profil")}<div class="empty">Dieses Training läuft gerade. Bearbeite es im Training-Tab.<a class="btn quiet" href="#training">Zum Training</a></div>`;
  if (S.editWo?.id !== id) S.editWo = buildEditWo(id);
  const e = S.editWo, w = S.workouts.find(x => x.id === id);
  if (!e) return `${backLink("profil")}<div class="empty">Dieses Training gibt es nicht oder es gehört jemand anderem.</div>`;
  return `${backLink("profil")}
    <h1 class="h1s">Training bearbeiten</h1>
    <form class="stack" id="ewForm">
      <div class="card">
        <label class="field" for="ewTitle">Name<input id="ewTitle" type="text" maxlength="40" value="${esc(e.title)}"></label>
        <p class="small muted">${L.fmtDT(w.started_at)}, ${new Date(w.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</p>
      </div>
      ${e.groups.map((g, gi) => `<section class="card">
        <h3>${esc(g.exercise)}</h3>
        <div class="sets num">
          <span class="h">Satz</span><span class="h">kg</span><span class="h">Wdh.</span><span></span>
          ${g.rows.map((r, k) => `<span class="i">${k + 1}</span>
            <input id="ew-${gi}-${k}-w" type="number" inputmode="decimal" step="0.25" min="0" value="${r.w}" data-g="${gi}" data-k="${k}" data-ef="w" aria-label="Gewicht Satz ${k + 1}" ${r.del ? 'class="gone" disabled' : ""}>
            <input id="ew-${gi}-${k}-r" type="number" inputmode="numeric" min="1" value="${r.r}" data-g="${gi}" data-k="${k}" data-ef="r" aria-label="Wiederholungen Satz ${k + 1}" ${r.del ? 'class="gone" disabled' : ""}>
            <button type="button" class="tick" data-act="ewDel" data-g="${gi}" data-k="${k}" aria-label="${r.del ? "Satz behalten" : "Satz löschen"}"><i class="ph ${r.del ? "ph-arrow-counter-clockwise" : "ph-trash"}"></i></button>`).join("")}
        </div>
        <button type="button" class="link" data-act="ewAddRow" data-g="${gi}"><i class="ph ph-plus"></i> Satz</button>
      </section>`).join("")}
      <div class="card">
        <label class="field" for="ewNewEx">Übung hinzufügen<input id="ewNewEx" type="text" list="exlist" autocomplete="off"></label>
        <datalist id="exlist">${allExercises().map(x => `<option value="${esc(x)}">`).join("")}</datalist>
        <button type="button" class="btn quiet" data-act="ewAddEx" style="align-self:flex-start"><i class="ph ph-plus"></i>Hinzufügen</button>
      </div>
      <div class="row"><button class="btn" type="submit">Speichern</button><button type="button" class="btn quiet" data-act="back" data-v="profil">Abbrechen</button></div>
    </form>
    ${S.confirm === "delWo" ? `<div class="card"><p>Training „${esc(e.title)}“ mit allen Sätzen löschen?</p><div class="row"><button class="btn danger" data-act="delWoYes">Löschen</button><button class="btn quiet" data-act="confirmNo">Behalten</button></div></div>`
      : `<button class="link" data-act="delWo" style="color:var(--down)"><i class="ph ph-trash"></i> Training löschen</button>`}`;
}
async function saveEditWo() {
  const e = S.editWo, w = S.workouts.find(x => x.id === e.id);
  const title = ($("#ewTitle").value || "").trim() || w.title;
  const num = v => parseFloat(String(v).replace(",", "."));
  await guard(async () => {
    for (const g of e.groups) for (const r of g.rows) {
      if (r.del || r.id && num(r.w) === +r.w0 && +r.r === +r.r0) continue;
      if (!r.id && r.w === "" && r.r === "") continue;
      if (!(num(r.w) >= 0 && parseInt(r.r, 10) > 0)) throw new Error(`Bei ${g.exercise} fehlt ein Gewicht oder eine Wiederholungszahl.`);
    }
    if (title !== w.title) await api.updateWorkout(e.id, { title });
    for (const g of e.groups) for (const [k, r] of g.rows.entries()) {
      const wv = num(r.w), rv = parseInt(r.r, 10);
      if (r.id && r.del) await api.deleteSet(r.id);
      else if (r.id && (wv !== +r.w0 || rv !== +r.r0)) await api.updateSet(r.id, { weight: wv, reps: rv, set_index: k });
      else if (!r.id && !r.del && wv >= 0 && rv > 0) await api.addSet({ workout_id: e.id, exercise: g.exercise, set_index: k, weight: wv, reps: rv, performed_at: w.started_at });
    }
    S.editWo = null; await loadMine(); location.hash = "profil"; toast("Training gespeichert");
  });
}

// ---------- Challenges ----------
function challengesView() {
  if (!S.challenges) { loadChallenges(); return `<p class="muted">Lädt …</p>` }
  const today = localISO(new Date());
  const form = S.newCh ? `<form class="card" id="chForm">
      <h3>Neue Challenge</h3>
      <label class="field" for="chTitle">Name<input id="chTitle" type="text" maxlength="60" placeholder="z. B. Bank-November" required></label>
      <label class="field" for="chEx">Übung<input id="chEx" type="text" list="exlist" autocomplete="off" value="Bankdrücken (Langhantel)" required></label>
      <datalist id="exlist">${allExercises().map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      <label class="field" for="chMetric">Gewertet wird<select id="chMetric"><option value="gain_pct">Steigerung in Prozent (fair bei unterschiedlicher Stärke)</option><option value="gain_kg">Steigerung in kg</option></select></label>
      <div class="row"><label class="field" for="chStart" style="flex:1">Start<input id="chStart" type="date" value="${today}"></label>
        <label class="field" for="chEnd" style="flex:1">Ende<input id="chEnd" type="date" value="${localISO(Date.now() + 27 * 864e5)}"></label></div>
      <div class="row"><button class="btn" type="submit">Erstellen und mitmachen</button><button type="button" class="btn quiet" data-act="newCh" data-v="0">Abbrechen</button></div>
    </form>` : `<button class="btn ghost block" data-act="newCh" data-v="1"><i class="ph ph-plus"></i>Neue Challenge</button>`;
  const card = ch => {
    const members = ch.challenge_members.map(m => m.user_id), joined = members.includes(S.me);
    const days = Math.round((new Date(ch.ends_on + "T00:00:00") - new Date(today + "T00:00:00")) / 864e5);
    const startIn = Math.round((new Date(ch.starts_on + "T00:00:00") - new Date(today + "T00:00:00")) / 864e5);
    const state = startIn > 0 ? `startet in ${startIn} ${startIn === 1 ? "Tag" : "Tagen"}` : days < 0 ? "beendet" : days === 0 ? "letzter Tag" : `noch ${days} ${days === 1 ? "Tag" : "Tage"}`;
    const sets = S.chData[ch.id];
    const rows = sets ? L.challengeStandings(ch, sets, members) : null;
    const val = r => r.score == null ? '<span class="small muted">noch keine Wertung</span>'
      : ch.metric === "gain_kg" ? `<b>${r.kg >= 0 ? "+" : "−"}${L.fmtW(Math.abs(Math.round(r.kg * 10) / 10))}</b> <span class="small muted">kg</span>`
      : `<b>${r.pct >= 0 ? "+" : "−"}${L.fmtW(Math.abs(Math.round(r.pct * 10) / 10))}</b> <span class="small muted">%</span>`;
    return `<article class="card">
      <div class="spread"><h3>${esc(ch.title)}</h3><span class="chip ${days < 0 ? "" : "up"}">${state}</span></div>
      <p class="small muted">${esc(ch.exercise)}, ${L.fmtD(ch.starts_on + "T12:00")} bis ${L.fmtD(ch.ends_on + "T12:00")}, ${ch.metric === "gain_kg" ? "Steigerung in kg" : "Steigerung in %"}</p>
      ${rows ? (rows.length ? `<div>${rows.map((r, k) => `<a class="rank ${k === 0 && r.score != null ? "first" : ""} ${r.user_id === S.me ? "mine" : ""}" href="${exLink(r.user_id, ch.exercise)}">
          <span class="pos num">${k + 1}</span><span class="av ${r.user_id === S.me ? "me" : ""}">${initials(nameOf(r.user_id))}</span>
          <div style="min-width:0"><h3>${esc(nameOf(r.user_id))}</h3><p class="small muted num">${r.base != null ? `von ca. ${Math.round(r.base)} kg` : "noch kein Satz"}${r.now != null ? ` auf ${Math.round(r.now)} kg` : ""}</p></div>
          <div class="val num">${val(r)}</div></a>`).join("")}</div>` : '<p class="small muted">Noch niemand dabei.</p>') : '<p class="small muted">Lädt Wertung …</p>'}
      <div class="row">
        ${days >= 0 ? (joined ? `<button class="btn quiet" data-act="leaveCh" data-id="${ch.id}">Austreten</button>` : `<button class="btn" data-act="joinCh" data-id="${ch.id}"><i class="ph ph-plus"></i>Mitmachen</button>`) : ""}
        ${ch.created_by === S.me ? (S.confirm === "delCh" + ch.id
          ? `<button class="btn danger" data-act="delChYes" data-id="${ch.id}">Wirklich löschen</button><button class="btn quiet" data-act="confirmNo">Behalten</button>`
          : `<button class="link" data-act="delCh" data-id="${ch.id}" style="color:var(--muted)">Löschen</button>`) : ""}
      </div>
    </article>`;
  };
  const running = S.challenges.filter(c => c.ends_on >= today), done = S.challenges.filter(c => c.ends_on < today);
  return `${form}
    ${running.length ? `<div class="stack">${running.map(card).join("")}</div>` : `<div class="empty">Gerade läuft keine Challenge. Leg eine an, zum Beispiel: Wer steigert sein Bankdrücken bis Monatsende am meisten?</div>`}
    ${done.length ? `<details><summary>Beendet (${done.length})</summary><div class="stack" style="margin-top:8px">${done.map(card).join("")}</div></details>` : ""}
    <p class="small muted">Gewertet wird das beste geschätzte 1RM im Zeitraum gegenüber dem besten davor. Wer die Übung vorher noch nie gemacht hat, startet mit seiner ersten Einheit im Zeitraum.</p>`;
}
async function loadChallenges() {
  await guard(async () => {
    [S.challenges, S.profiles] = await Promise.all([api.challenges(), api.profiles()]);
    render();
    for (const ch of S.challenges) {
      const ids = ch.challenge_members.map(m => m.user_id);
      S.chData[ch.id] = ids.length ? await api.exerciseSets(ch.exercise, ids) : [];
    }
    if (route() === "rangliste") render();
  });
}
async function createChallenge() {
  const title = $("#chTitle").value.trim(), exercise = L.normName($("#chEx").value || ""), metric = $("#chMetric").value;
  const starts_on = $("#chStart").value, ends_on = $("#chEnd").value;
  if (!title || !exercise) { S.error = "Gib der Challenge einen Namen und eine Übung."; return render() }
  if (!starts_on || !ends_on || ends_on < starts_on) { S.error = "Das Ende muss nach dem Start liegen."; return render() }
  await guard(async () => { await api.createChallenge({ title, exercise, metric, starts_on, ends_on }); S.newCh = false; S.challenges = null; render(); toast("Challenge erstellt") });
}

// ---------- Feed: Reaktionen & Kommentare ----------
const KINDS = [["fire", "ph-fire", "Feuer"], ["strong", "ph-barbell", "Stark"], ["clap", "ph-hands-clapping", "Applaus"]];
function socialHTML(w) {
  const rs = w.reactions || [], cs = (w.comments || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return `<div class="reacts">${KINDS.map(([k, icon, label]) => {
      const n = rs.filter(r => r.kind === k).length, mine = rs.some(r => r.kind === k && r.user_id === S.me);
      const who = rs.filter(r => r.kind === k).map(r => nameOf(r.user_id)).join(", ");
      return `<button class="react" data-act="react" data-id="${w.id}" data-v="${k}" aria-pressed="${mine}" aria-label="${label}${who ? ": " + esc(who) : ""}" title="${esc(who)}"><i class="ph ${icon}"></i>${n ? `<span class="num">${n}</span>` : ""}</button>`;
    }).join("")}
    <button class="react" data-act="toggleComment" data-id="${w.id}" aria-expanded="${S.commentOpen === w.id}" aria-label="Kommentieren"><i class="ph ph-chat-circle"></i>${cs.length ? `<span class="num">${cs.length}</span>` : ""}</button>
    ${w.user_id === S.me && w.ended_at ? `<a class="react" href="#workout/${w.id}" aria-label="Training bearbeiten"><i class="ph ph-pencil-simple"></i></a>` : ""}
  </div>
  ${cs.length ? `<div class="comments">${cs.map(c => `<p><a href="#person/${c.user_id}"><b>${esc(nameOf(c.user_id))}</b></a> ${esc(c.body)}${c.user_id === S.me ? ` <button class="link" data-act="delComment" data-id="${c.id}" data-w="${w.id}" aria-label="Kommentar löschen" style="color:var(--muted);padding:0"><i class="ph ph-x"></i></button>` : ""}</p>`).join("")}</div>` : ""}
  ${S.commentOpen === w.id ? `<form class="row" id="cform" data-id="${w.id}" style="flex-wrap:nowrap"><input id="cbody" type="text" maxlength="300" placeholder="Kommentar" aria-label="Kommentar" autocomplete="off" style="flex:1;min-width:0"><button class="btn" type="submit" aria-label="Senden"><i class="ph ph-paper-plane-right"></i></button></form>` : ""}`;
}
function weekStrip() {
  if (!S.weeks) return "";
  const by = new Map();
  S.weeks.forEach(w => { (by.get(w.user_id) ?? by.set(w.user_id, []).get(w.user_id)).push(w.started_at) });
  const rows = S.profiles.filter(p => by.has(p.id)).map(p => ({ p, goal: p.weekly_goal ?? 3, ...L.streak(by.get(p.id), p.weekly_goal ?? 3) }))
    .sort((a, b) => b.streak - a.streak || b.thisWeek / b.goal - a.thisWeek / a.goal);
  if (!rows.length) return "";
  return `<div class="card"><h3>Diese Woche</h3>${rows.map(x => `<a class="weekrow" href="#person/${x.p.id}">
      <span class="av ${x.p.id === S.me ? "me" : ""}">${initials(x.p.name)}</span><span class="nm">${esc(x.p.name)}</span>${pips(x.thisWeek, x.goal)}${x.streak ? `<span class="streak num"><i class="ph ph-fire"></i>${x.streak}</span>` : ""}</a>`).join("")}</div>`;
}

// ---------- Push-Benachrichtigungen ----------
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
const pushOn = () => store.get("bwau.push") === true && typeof Notification !== "undefined" && Notification.permission === "granted";
let swReg = null;
async function initSW() { try { if ("serviceWorker" in navigator) swReg = await navigator.serviceWorker.register("sw.js") } catch { } }
function b64urlBytes(s) {
  const b = atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function enablePush() {
  if (!pushSupported()) throw new Error("Dieses Gerät oder dieser Browser unterstützt keine Benachrichtigungen.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Benachrichtigungen wurden nicht erlaubt. Du kannst das in den iPhone-Einstellungen unter Mitteilungen → BWAU ändern.");
  swReg ??= await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await swReg.pushManager.getSubscription()) ?? await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlBytes(VAPID_PUBLIC) });
  await api.savePushSub(sub);
  store.set("bwau.push", true);
}
async function disablePush() {
  const sub = await swReg?.pushManager.getSubscription();
  if (sub) { await api.deletePushSub(sub.endpoint).catch(() => { }); await sub.unsubscribe() }
  store.set("bwau.push", false);
}
// Pausen-Ende in Supabase planen bzw. löschen, damit die Nachricht auch bei gesperrtem Handy kommt
function syncRestPush() {
  if (!pushOn()) return;
  const next = active?.items.find(it => it.rows.some(r => !r.id))?.exercise;
  (rest ? api.schedulePush(rest.end, "Pause vorbei", next ? `Weiter mit ${next}` : "Weiter geht's.") : api.cancelPush()).catch(() => { });
}
function pushCard() {
  let body;
  if (DEMO) body = `<p class="small muted">Im Demo-Modus nicht verfügbar.</p>`;
  else if (!pushSupported()) body = standalone()
    ? `<p class="small muted">Dieses Gerät unterstützt keine Benachrichtigungen. Auf dem iPhone braucht es mindestens iOS 16.4.</p>`
    : `<p class="small muted">Öffne BWAU über das Icon auf deinem Home-Bildschirm. Nur dort erlaubt das iPhone Benachrichtigungen.</p>`;
  else if (pushOn()) body = `<p class="small muted">Aktiv auf diesem Gerät. Wenn die Pause vorbei ist, kommt eine Mitteilung, auch bei gesperrtem Handy.</p>
      <div class="row"><button class="btn quiet" data-act="pushTest"><i class="ph ph-bell-ringing"></i>Test senden</button><button class="link" data-act="pushOff" style="color:var(--muted)">Ausschalten</button></div>`;
  else body = `<p class="small muted">Bekomm eine Mitteilung, wenn die Pause vorbei ist, auch wenn das Handy gesperrt ist.</p>
      <button class="btn" data-act="pushOn" style="align-self:flex-start" ${S.pushMsg ? "disabled" : ""}><i class="ph ph-bell"></i>${S.pushMsg || "Aktivieren"}</button>`;
  return `<div class="card"><h2>Benachrichtigungen</h2>${body}</div>`;
}

// ---------- Ereignisse ----------
document.addEventListener("pointerdown", unlockAudio, { once: true });

document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j;
  if (b.tagName === "BUTTON" && b.type !== "submit") ev.preventDefault();
  switch (a) {
    case "loginMode": loginMode = loginMode === "in" ? "up" : "in"; S.error = null; return render();
    case "startEmpty": return startWorkout("Training", []);
    case "repeat": {
      const w = S.workouts.find(x => x.id === +b.dataset.id);
      const ex = []; S.sets.filter(s => s.workout_id === w.id).forEach(s => { const e = ex.find(x => x.exercise === s.exercise); e ? e.sets++ : ex.push({ exercise: s.exercise, sets: 1 }) });
      return startWorkout(w.title, ex);
    }
    case "startPlan": { const p = S.plans.find(x => x.id === +b.dataset.id); return startWorkout(p.name, p.items) }
    case "newPlan": S.editPlan = { name: "", shared: false, items: [{ exercise: "", sets: 3 }] }; S.confirm = null; return render();
    case "editPlan": S.editPlan = structuredClone(S.plans.find(x => x.id === +b.dataset.id)); S.confirm = null; return render();
    case "copyPlan": { const p = S.plans.find(x => x.id === +b.dataset.id); S.editPlan = { name: p.name, shared: false, items: structuredClone(p.items) }; return render() }
    case "planAdd": readPlanForm(); S.editPlan.items.push({ exercise: "", sets: 3 }); render(); return $(`#pex-${S.editPlan.items.length - 1}`)?.focus();
    case "planDel": readPlanForm(); S.editPlan.items.splice(+b.dataset.k, 1); return render();
    case "planCancel": S.editPlan = null; S.error = null; return render();
    case "planDelete": readPlanForm(); S.confirm = "deletePlan"; return render();
    case "planDeleteYes": return guard(async () => { await api.deletePlan(S.editPlan.id); S.editPlan = null; S.confirm = null; S.plans = await api.plans(); render(); toast("Plan gelöscht") });
    case "confirmNo": S.confirm = null; return render();
    case "tick": return tick(i, j);
    case "addRow": { const it = active.items[i], last = it.rows.at(-1); it.rows.push({ w: last ? last.w : "", r: "", id: null, tr: last?.tr }); saveActive(); return render() }
    case "removeEx": {
      const it = active.items[i];
      if (it.rows.some(r => r.id)) { toast("Nimm erst die abgehakten Sätze zurück."); return }
      active.items.splice(i, 1); saveActive(); return render();
    }
    case "finish": return finishWorkout();
    case "discard": S.confirm = "discard"; return render();
    case "discardYes": return discardWorkout();
    case "restAdd": rest.end += +b.dataset.d * 1000; rest.total = Math.max(rest.total, Math.round((rest.end - Date.now()) / 1000)); rest.beeped = false; saveRest(); syncRestPush(); return renderTimer();
    case "restSkip": rest = null; saveRest(); syncRestPush(); return renderTimer();
    case "pushOn": S.pushMsg = "Wird aktiviert …"; render(); return guard(async () => { try { await enablePush(); S.pushMsg = null; toast("Benachrichtigungen aktiv") } catch (e) { S.pushMsg = null; throw e } render() });
    case "pushOff": return guard(async () => { await disablePush(); render(); toast("Benachrichtigungen aus") });
    case "pushTest": return guard(async () => { await api.schedulePush(Date.now() + 10000, "BWAU", "Test: Benachrichtigungen funktionieren."); toast("Kommt in etwa 10 Sekunden. Du kannst das Handy sperren.") });
    case "progTab": S.progTab = b.dataset.v; return render();
    case "openSettings": { const n = decodeURIComponent(b.dataset.v); S.openSettings = S.openSettings === n ? null : n; return render() }
    case "resetSettings": { const n = decodeURIComponent(b.dataset.v); return guard(async () => { await api.deleteSetting(n); S.settings.delete(n); render() }) }
    case "feedMine": S.feedMine = b.dataset.v === "1"; return render();
    case "back": if (history.length > 1) history.back(); else location.hash = b.dataset.v || "training"; return;
    case "lbMode": S.lbMode = b.dataset.v; S.confirm = null; return render();
    case "newCh": S.newCh = b.dataset.v === "1"; return render();
    case "joinCh": return guard(async () => { await api.joinChallenge(+b.dataset.id); S.challenges = null; render() });
    case "leaveCh": return guard(async () => { await api.leaveChallenge(+b.dataset.id); S.challenges = null; render() });
    case "delCh": S.confirm = "delCh" + b.dataset.id; return render();
    case "delChYes": return guard(async () => { await api.deleteChallenge(+b.dataset.id); S.confirm = null; S.challenges = null; render(); toast("Challenge gelöscht") });
    case "react": {
      const w = S.feed.find(x => x.id === +b.dataset.id), k = b.dataset.v;
      const mine = w.reactions.some(r => r.kind === k && r.user_id === S.me);
      w.reactions = mine ? w.reactions.filter(r => !(r.kind === k && r.user_id === S.me)) : [...w.reactions, { kind: k, user_id: S.me }];
      render();
      return guard(() => mine ? api.unreact(w.id, k) : api.react(w.id, k));
    }
    case "toggleComment": { const id = +b.dataset.id; S.commentOpen = S.commentOpen === id ? null : id; render(); return $("#cbody")?.focus() }
    case "delComment": {
      const w = S.feed.find(x => x.id === +b.dataset.w), id = +b.dataset.id;
      w.comments = w.comments.filter(c => c.id !== id); render();
      return guard(() => api.deleteComment(id));
    }
    case "showAllWo": S.showAllWo = !S.showAllWo; return render();
    case "ewDel": { const g = S.editWo.groups[+b.dataset.g], r = g.rows[+b.dataset.k]; if (!r.id) g.rows.splice(+b.dataset.k, 1); else r.del = !r.del; return render() }
    case "ewAddRow": { const g = S.editWo.groups[+b.dataset.g], last = g.rows.at(-1); g.rows.push({ id: null, w: last ? last.w : "", r: "", del: false }); return render() }
    case "ewAddEx": {
      const name = L.normName($("#ewNewEx").value || ""); if (!name) return;
      if (!S.editWo.groups.some(g => g.exercise === name)) S.editWo.groups.push({ exercise: name, rows: [{ id: null, w: "", r: "", del: false }] });
      if (!allExercises().includes(name)) guard(async () => { await api.addExercise(name); S.custom.push(name) });
      return render();
    }
    case "delWo": S.confirm = "delWo"; return render();
    case "delWoYes": return guard(async () => { await api.deleteWorkout(S.editWo.id); S.editWo = null; S.confirm = null; await loadMine(); location.hash = "profil"; toast("Training gelöscht") });
    case "logout": await api.signOut(); S.me = null; active = null; saveActive(); rest = null; saveRest(); location.hash = ""; return render();
  }
});

document.addEventListener("input", ev => {
  const t = ev.target;
  if (t.dataset.ef && S.editWo) { const r = S.editWo.groups[+t.dataset.g]?.rows[+t.dataset.k]; if (r) r[t.dataset.ef] = t.value; return }
  if (t.dataset.f && active) { const row = active.items[+t.dataset.i]?.rows[+t.dataset.j]; if (row) { row[t.dataset.f] = t.value; if (t.dataset.f === "w") row.manual = true; saveActive() } }
});

document.addEventListener("change", async ev => {
  const t = ev.target;
  if (t.id === "lbEx") { S.lbEx = t.value; return render() }
  if (t.id === "hevyFile" && t.files[0]) return importHevy(t.files[0]);
  const box = t.closest(".settings");
  if (box && t.dataset.s) {
    const ex = decodeURIComponent(box.dataset.ex), v = parseFloat(t.value);
    if (!(v > 0)) return;
    const cur = S.settings.get(ex) || { exercise: ex };
    const next = { ...cur, [t.dataset.s]: v };
    await guard(async () => { await api.saveSetting(ex, { rep_min: next.rep_min ?? null, rep_max: next.rep_max ?? null, step: next.step ?? null }); S.settings.set(ex, next); render(); $("#" + t.id)?.focus() });
  }
});

document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "loginForm") return submitLogin();
  if (f.id === "planForm") return savePlan();
  if (f.id === "ewForm") return saveEditWo();
  if (f.id === "chForm") return createChallenge();
  if (f.id === "cform") {
    const body = $("#cbody").value.trim(); if (!body) return;
    const w = S.feed.find(x => x.id === +f.dataset.id);
    return guard(async () => { const c = await api.comment(w.id, body); w.comments = [...(w.comments || []), c]; S.commentOpen = null; render() });
  }
  if (f.id === "addExForm") {
    const name = L.normName($("#newEx").value || ""); if (!name) return;
    await guard(async () => {
      if (!allExercises().includes(name)) { await api.addExercise(name); S.custom.push(name) }
      active.items.push(...makeItems([{ exercise: name }])); saveActive(); render();
      $("#newEx")?.focus();
    });
  }
  if (f.id === "profileForm") {
    const num = (id, d) => { const v = parseFloat($(id).value); return v > 0 ? v : d };
    const patch = { rep_min: Math.round(num("#prmin", 6)), rep_max: Math.round(num("#prmax", 8)), rest_seconds: Math.round(num("#prrest", 120)), bodyweight: num("#prbw", null), weekly_goal: Math.min(7, Math.max(1, Math.round(num("#prgoal", 3)))) };
    if (patch.rep_min > patch.rep_max) { S.error = "Wdh. min darf nicht größer als Wdh. max sein."; return render() }
    await guard(async () => { await api.updateProfile(patch); Object.assign(S.profile, patch); render(); toast("Gespeichert") });
  }
  if (f.id === "pinForm") {
    const pin = $("#newPin").value.trim();
    if (!/^\d{4,6}$/.test(pin)) { S.error = "Die PIN muss aus 4 bis 6 Ziffern bestehen."; return render() }
    await guard(async () => { await api.changePin(pin); render(); toast("PIN geändert") });
  }
});

addEventListener("hashchange", () => {
  S.error = null; S.confirm = null;
  const r = route();
  if (r === "feed") S.feed = null;
  if (r === "rangliste") { S.best = null; S.challenges = null }
  if (r !== "workout") S.editWo = null;
  if (r === "person" || r === "uebung") { const uid = parts()[1]; if (uid !== S.me) delete S.people[uid] }
  render(); scrollTo(0, 0);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { keepAwake(); renderTimer() } });
setInterval(() => {
  if (!S.me) return;
  renderTimer();
  const el = document.getElementById("elapsed"); if (el && active) el.textContent = elapsed(active.startedAt);
}, 250);

// ---------- Start ----------
(async () => {
  try {
    api = await createApi();
    initSW();
    S.me = await api.session();
    if (S.me) await loadMine();
    if (S.me && !S.profile) { await api.signOut(); S.me = null }
  } catch (e) { S.error = "Die App konnte nicht starten: " + (e.message || e) }
  if (active && S.me) keepAwake();
  render();
})();
