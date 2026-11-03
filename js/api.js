// Datenzugriff: Supabase, oder ein Demo-Speicher im Browser, solange config.js leer ist.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=mw12svea";
import { nameToEmail, pinToPassword } from "./logic.js?v=mw12svea";

export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

function friendly(err) {
  const m = err?.message || String(err);
  if (/Invalid login credentials/i.test(m)) return "Name oder PIN falsch.";
  if (/already registered|already exists/i.test(m)) return "Dieser Name ist schon vergeben.";
  if (/rate limit/i.test(m)) return "Zu viele Versuche. Warte kurz und probier es dann nochmal.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Keine Verbindung. Prüf dein Internet.";
  return m;
}
const must = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data };

function supabaseApi(sb) {
  let me = null;
  async function pageAll(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = must(await build().range(from, from + 999));
      out.push(...rows); if (rows.length < 1000) return out;
    }
  }
  return {
    async session() {
      const { data } = await sb.auth.getSession();
      me = data.session?.user?.id ?? null; return me;
    },
    async signUp(name, pin) {
      const data = must(await sb.auth.signUp({ email: nameToEmail(name), password: pinToPassword(pin), options: { data: { name: name.trim() } } }));
      if (!data.session) throw new Error("Registrierung hat geklappt, aber Supabase verlangt noch eine E-Mail-Bestätigung. In Supabase unter Authentication → Sign In / Providers → Email „Confirm email“ ausschalten.");
      me = data.user.id; return me;
    },
    async signIn(name, pin) {
      const data = must(await sb.auth.signInWithPassword({ email: nameToEmail(name), password: pinToPassword(pin) }));
      me = data.user.id; return me;
    },
    async signOut() { await sb.auth.signOut(); me = null },
    async changePin(pin) { must(await sb.auth.updateUser({ password: pinToPassword(pin) })) },

    async profiles() { return must(await sb.from("profiles").select("*")) },
    async updateProfile(patch) { must(await sb.from("profiles").update(patch).eq("id", me)) },

    async myWorkouts() { return pageAll(() => sb.from("workouts").select("id,title,started_at,ended_at").eq("user_id", me).order("started_at")) },
    async mySets() { return pageAll(() => sb.from("sets").select("id,workout_id,exercise,set_index,weight,reps,performed_at").eq("user_id", me).order("id")) },
    async startWorkout(title) { return must(await sb.from("workouts").insert({ title, started_at: new Date().toISOString() }).select().single()) },
    async finishWorkout(id) { must(await sb.from("workouts").update({ ended_at: new Date().toISOString() }).eq("id", id)) },
    async deleteWorkout(id) { must(await sb.from("workouts").delete().eq("id", id)) },
    async addSet(s) { return must(await sb.from("sets").insert(s).select().single()) },
    async deleteSet(id) { must(await sb.from("sets").delete().eq("id", id)) },

    async feed(limit = 40) {
      return must(await sb.from("workouts").select("id,user_id,title,started_at,ended_at,sets(exercise,weight,reps,set_index),reactions(kind,user_id),comments(id,user_id,body,created_at)")
        .order("started_at", { ascending: false }).limit(limit));
    },
    async bestLifts() { return pageAll(() => sb.from("best_lifts").select("*").order("e1rm", { ascending: false })) },

    async customExercises() { return must(await sb.from("exercises").select("name")).map(r => r.name) },
    async addExercise(name) { const { error } = await sb.from("exercises").insert({ name }); if (error && error.code !== "23505") throw new Error(friendly(error)) },

    async settings() { return must(await sb.from("exercise_settings").select("*")) },
    async saveSetting(exercise, patch) { must(await sb.from("exercise_settings").upsert({ user_id: me, exercise, ...patch })) },
    async deleteSetting(exercise) { must(await sb.from("exercise_settings").delete().eq("user_id", me).eq("exercise", exercise)) },

    async plans() { return must(await sb.from("plans").select("*").order("created_at")) },
    async savePlan(p) {
      const row = { name: p.name, items: p.items, shared: !!p.shared };
      return p.id ? must(await sb.from("plans").update(row).eq("id", p.id).select().single())
                  : must(await sb.from("plans").insert(row).select().single());
    },
    async deletePlan(id) { must(await sb.from("plans").delete().eq("id", id)) },

    async updateWorkout(id, patch) { must(await sb.from("workouts").update(patch).eq("id", id)) },
    async updateSet(id, patch) { must(await sb.from("sets").update(patch).eq("id", id)) },
    async userWorkouts(uid) { return pageAll(() => sb.from("workouts").select("id,title,started_at,ended_at").eq("user_id", uid).order("started_at")) },
    async userSets(uid) { return pageAll(() => sb.from("sets").select("id,workout_id,exercise,set_index,weight,reps,performed_at").eq("user_id", uid).order("id")) },
    async weekWorkouts(since) { return pageAll(() => sb.from("workouts").select("user_id,started_at").not("ended_at", "is", null).gte("started_at", since)) },
    async exerciseSets(exercise, uids) { return pageAll(() => sb.from("sets").select("user_id,weight,reps,performed_at").eq("exercise", exercise).in("user_id", uids)) },

    async react(workout_id, kind) { const { error } = await sb.from("reactions").insert({ workout_id, kind }); if (error && error.code !== "23505") throw new Error(friendly(error)) },
    async unreact(workout_id, kind) { must(await sb.from("reactions").delete().eq("workout_id", workout_id).eq("kind", kind).eq("user_id", me)) },
    async comment(workout_id, body) { return must(await sb.from("comments").insert({ workout_id, body }).select().single()) },
    async deleteComment(id) { must(await sb.from("comments").delete().eq("id", id)) },

    async challenges() { return must(await sb.from("challenges").select("*,challenge_members(user_id)").order("ends_on", { ascending: false })) },
    async createChallenge(ch) { const row = must(await sb.from("challenges").insert(ch).select().single()); await this.joinChallenge(row.id); return row },
    async deleteChallenge(id) { must(await sb.from("challenges").delete().eq("id", id)) },
    async joinChallenge(id) { const { error } = await sb.from("challenge_members").insert({ challenge_id: id }); if (error && error.code !== "23505") throw new Error(friendly(error)) },
    async leaveChallenge(id) { must(await sb.from("challenge_members").delete().eq("challenge_id", id).eq("user_id", me)) },

    // Hevy-Import: bereits vorhandene Trainings (gleiche Startzeit) werden übersprungen
    async importWorkouts(list, onProgress) {
      const existing = new Set((await this.myWorkouts()).map(w => new Date(w.started_at).toISOString()));
      const fresh = list.filter(w => !existing.has(w.started_at));
      let done = 0;
      for (let i = 0; i < fresh.length; i += 50) {
        const chunk = fresh.slice(i, i + 50);
        const rows = must(await sb.from("workouts").insert(chunk.map(w => ({ title: w.title, started_at: w.started_at, ended_at: w.ended_at, source: "hevy" }))).select("id,started_at"));
        const ids = new Map(rows.map(r => [new Date(r.started_at).toISOString(), r.id]));
        const sets = chunk.flatMap(w => w.sets.map(s => ({ ...s, workout_id: ids.get(w.started_at), performed_at: w.started_at })));
        for (let j = 0; j < sets.length; j += 500) must(await sb.from("sets").insert(sets.slice(j, j + 500)));
        done += chunk.length; onProgress?.(done, fresh.length);
      }
      return { added: fresh.length, skipped: list.length - fresh.length };
    },
  };
}

// ---------- Demo-Modus: gleiche Funktionen, Speicher im Browser ----------
function demoApi() {
  const KEY = "bwau.demo";
  let db; try { db = JSON.parse(localStorage.getItem(KEY)) } catch { }
  db ??= { seq: 1, users: [], workouts: [], sets: [], plans: [], exercises: [], settings: [], session: null };
  for (const k of ["reactions", "comments", "challenges", "members"]) db[k] ??= [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { } };
  const id = () => db.seq++;
  const me = () => db.session;
  const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 30));
  return {
    async session() { return me() },
    async signUp(name, pin) {
      if (db.users.some(u => u.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("Dieser Name ist schon vergeben.");
      const u = { id: "u" + id(), name: name.trim(), pin, bodyweight: null, rep_min: 6, rep_max: 8, rest_seconds: 120 };
      db.users.push(u); db.session = u.id; save(); return u.id;
    },
    async signIn(name, pin) {
      const u = db.users.find(u => u.name.toLowerCase() === name.trim().toLowerCase() && u.pin === pin);
      if (!u) throw new Error("Name oder PIN falsch."); db.session = u.id; save(); return u.id;
    },
    async signOut() { db.session = null; save() },
    async changePin(pin) { db.users.find(u => u.id === me()).pin = pin; save() },
    async profiles() { return wait(db.users.map(({ pin, ...u }) => u)) },
    async updateProfile(patch) { Object.assign(db.users.find(u => u.id === me()), patch); save() },
    async myWorkouts() { return wait(db.workouts.filter(w => w.user_id === me()).sort((a, b) => a.started_at.localeCompare(b.started_at))) },
    async mySets() { return wait(db.sets.filter(s => s.user_id === me())) },
    async startWorkout(title) { const w = { id: id(), user_id: me(), title, started_at: new Date().toISOString(), ended_at: null }; db.workouts.push(w); save(); return wait(w) },
    async finishWorkout(wid) { db.workouts.find(w => w.id === wid).ended_at = new Date().toISOString(); save() },
    async deleteWorkout(wid) { db.workouts = db.workouts.filter(w => w.id !== wid); db.sets = db.sets.filter(s => s.workout_id !== wid); save() },
    async addSet(s) { const r = { id: id(), user_id: me(), performed_at: new Date().toISOString(), ...s }; db.sets.push(r); save(); return wait(r) },
    async deleteSet(sid) { db.sets = db.sets.filter(s => s.id !== sid); save() },
    async feed(limit = 40) {
      return wait([...db.workouts].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit)
        .map(w => ({ ...w, sets: db.sets.filter(s => s.workout_id === w.id), reactions: db.reactions.filter(r => r.workout_id === w.id), comments: db.comments.filter(r => r.workout_id === w.id) })));
    },
    async bestLifts() {
      const best = new Map();
      for (const s of db.sets) {
        if (s.reps > 15) continue;
        const k = s.user_id + "|" + s.exercise, e = Math.round(s.weight * (1 + s.reps / 30) * 10) / 10;
        if (!best.has(k) || e > best.get(k).e1rm) best.set(k, { user_id: s.user_id, exercise: s.exercise, weight: s.weight, reps: s.reps, workout_id: s.workout_id, performed_at: s.performed_at, e1rm: e });
      }
      return wait([...best.values()].sort((a, b) => b.e1rm - a.e1rm));
    },
    async customExercises() { return wait(db.exercises) },
    async addExercise(name) { if (!db.exercises.includes(name)) db.exercises.push(name); save() },
    async settings() { return wait(db.settings.filter(s => s.user_id === me())) },
    async saveSetting(exercise, patch) {
      const s = db.settings.find(s => s.user_id === me() && s.exercise === exercise);
      s ? Object.assign(s, patch) : db.settings.push({ user_id: me(), exercise, ...patch }); save();
    },
    async deleteSetting(exercise) { db.settings = db.settings.filter(s => !(s.user_id === me() && s.exercise === exercise)); save() },
    async plans() { return wait(db.plans.filter(p => p.shared || p.user_id === me())) },
    async savePlan(p) {
      if (p.id) { const x = db.plans.find(x => x.id === p.id); Object.assign(x, { name: p.name, items: p.items, shared: !!p.shared }); save(); return wait(x) }
      const x = { id: id(), user_id: me(), name: p.name, items: p.items, shared: !!p.shared, created_at: new Date().toISOString() };
      db.plans.push(x); save(); return wait(x);
    },
    async deletePlan(pid) { db.plans = db.plans.filter(p => p.id !== pid); save() },
    async updateWorkout(wid, patch) { Object.assign(db.workouts.find(w => w.id === wid), patch); save() },
    async updateSet(sid, patch) { Object.assign(db.sets.find(s => s.id === sid), patch); save() },
    async userWorkouts(uid) { return wait(db.workouts.filter(w => w.user_id === uid).sort((a, b) => a.started_at.localeCompare(b.started_at))) },
    async userSets(uid) { return wait(db.sets.filter(s => s.user_id === uid)) },
    async weekWorkouts(since) { return wait(db.workouts.filter(w => w.ended_at && w.started_at >= since).map(w => ({ user_id: w.user_id, started_at: w.started_at }))) },
    async exerciseSets(exercise, uids) { return wait(db.sets.filter(s => s.exercise === exercise && uids.includes(s.user_id))) },
    async react(workout_id, kind) { if (!db.reactions.some(r => r.workout_id === workout_id && r.kind === kind && r.user_id === me())) db.reactions.push({ workout_id, kind, user_id: me() }); save() },
    async unreact(workout_id, kind) { db.reactions = db.reactions.filter(r => !(r.workout_id === workout_id && r.kind === kind && r.user_id === me())); save() },
    async comment(workout_id, body) { const r = { id: id(), workout_id, user_id: me(), body, created_at: new Date().toISOString() }; db.comments.push(r); save(); return wait(r) },
    async deleteComment(cid) { db.comments = db.comments.filter(c => c.id !== cid); save() },
    async challenges() { return wait(db.challenges.map(c => ({ ...c, challenge_members: db.members.filter(m => m.challenge_id === c.id) })).sort((a, b) => b.ends_on.localeCompare(a.ends_on))) },
    async createChallenge(ch) { const r = { id: id(), created_by: me(), created_at: new Date().toISOString(), ...ch }; db.challenges.push(r); db.members.push({ challenge_id: r.id, user_id: me() }); save(); return wait(r) },
    async deleteChallenge(cid) { db.challenges = db.challenges.filter(c => c.id !== cid); db.members = db.members.filter(m => m.challenge_id !== cid); save() },
    async joinChallenge(cid) { if (!db.members.some(m => m.challenge_id === cid && m.user_id === me())) db.members.push({ challenge_id: cid, user_id: me() }); save() },
    async leaveChallenge(cid) { db.members = db.members.filter(m => !(m.challenge_id === cid && m.user_id === me())); save() },
    async importWorkouts(list, onProgress) {
      const existing = new Set(db.workouts.filter(w => w.user_id === me()).map(w => w.started_at));
      const fresh = list.filter(w => !existing.has(w.started_at));
      for (const w of fresh) {
        const wid = id();
        db.workouts.push({ id: wid, user_id: me(), title: w.title, started_at: w.started_at, ended_at: w.ended_at, source: "hevy" });
        for (const s of w.sets) db.sets.push({ id: id(), user_id: me(), workout_id: wid, performed_at: w.started_at, ...s });
      }
      save(); onProgress?.(fresh.length, fresh.length);
      return { added: fresh.length, skipped: list.length - fresh.length };
    },
  };
}

export async function createApi() {
  if (DEMO) return demoApi();
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  return supabaseApi(createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }));
}
