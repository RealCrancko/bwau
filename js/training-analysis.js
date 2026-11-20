import { advise, e1rm, historyByExercise } from "./logic.js?v=set-feedback-1";

function bestEstimate(sets) {
  return sets.reduce((best, s) => s.w > 0 && s.r <= 15 ? Math.max(best, e1rm(s.w, s.r)) : best, 0);
}

export function analyzeWorkout(workout, workouts, sets, getConfig) {
  const start = Date.parse(workout.started_at);
  const before = workouts.filter(w => w.id !== workout.id && Date.parse(w.ended_at) <= start && Date.parse(w.started_at) < start);
  const allowed = new Map(before.map(w => [w.id, w]));
  allowed.set(workout.id, workout);
  const mine = sets.filter(s => s.workout_id === workout.id);
  const history = historyByExercise(sets.filter(s => allowed.has(s.workout_id)), allowed);
  const totals = { sets: mine.length, reps: 0, volume: 0, below: 0, within: 0, above: 0 };
  const exercises = [];
  for (const name of new Set(mine.map(s => s.exercise))) {
    const exercise = history.get(name);
    const current = exercise.sessions.at(-1);
    const previous = exercise.sessions.at(-2);
    const cfg = getConfig(name);
    for (const s of current.sets) {
      totals.reps += s.r;
      totals.volume += s.r * s.w;
      if (s.r < cfg.min) totals.below++;
      else if (s.r > cfg.max) totals.above++;
      else totals.within++;
    }
    const sameWeight = previous?.sets.filter(s => s.w === current.ww) || [];
    const priorBest = exercise.sessions.slice(0, -1).reduce((best, s) => Math.max(best, bestEstimate(s.sets)), 0);
    const estimate = bestEstimate(current.sets);
    exercises.push({ name, current, previous, cfg, advice: advise(exercise, cfg),
      priorReps: sameWeight.length ? Math.max(...sameWeight.map(s => s.r)) : null,
      record: priorBest > 0 && estimate > priorBest + 0.01 ? { priorBest, estimate } : null });
  }
  const prev = before.filter(w => w.title === workout.title).sort((a,b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  const priorSets = prev ? sets.filter(s => s.workout_id === prev.id) : [];
  const groups = new Map();
  for (const s of priorSets) groups.set(s.exercise, (groups.get(s.exercise) || 0) + 1);
  const sameLayout = groups.size === exercises.length && exercises.every(e => groups.get(e.name) === e.current.sets.length);
  const priorVolume = priorSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  return { exercises, totals, minutes: Math.max(0, Math.round((Date.parse(workout.ended_at) - start) / 60000)),
    volumeChange: prev && sameLayout && priorVolume > 0 ? Math.round((totals.volume / priorVolume - 1) * 100) : null,
    previousPlan: prev };
}
