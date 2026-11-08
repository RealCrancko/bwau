// Welche Muskeln eine Übung trifft (vereinfacht) und Link zu Ausführungsvideos.
// Regeln von speziell nach allgemein: Die erste passende gewinnt, auch für eigene Übungsnamen.
const RULES = [
  [/rückenstreck|hyperext/i, ["Unterer Rücken"], ["Gesäß", "Beinbeuger"]],
  [/rückenzug/i, ["Oberer Rücken"], ["Lat", "Bizeps"]],
  [/rumänisch|romanian|\brdl\b/i, ["Beinbeuger", "Gesäß"], ["Unterer Rücken"]],
  [/kreuzheben|deadlift/i, ["Gesäß", "Beinbeuger", "Unterer Rücken"], ["Quadrizeps", "Trapez", "Unterarme"]],
  [/schräg.*(drück|bank)|incline/i, ["Obere Brust"], ["Vordere Schulter", "Trizeps"]],
  [/trizeps|french press|skull/i, ["Trizeps"], []],
  [/bank.*drück|brustpresse|bench/i, ["Brust"], ["Trizeps", "Vordere Schulter"]],
  [/reverse|butterfly reverse|face.?pull/i, ["Hintere Schulter"], ["Oberer Rücken", "Trapez"]],
  [/fliegende|butterfly|cable.?fly|crossover/i, ["Brust"], ["Vordere Schulter"]],
  [/\bdips?\b/i, ["Brust", "Trizeps"], ["Vordere Schulter"]],
  [/seitheben|lateral raise/i, ["Seitliche Schulter"], ["Trapez"]],
  [/frontheben/i, ["Vordere Schulter"], []],
  [/schulter(drück|presse)|overhead press|military/i, ["Vordere Schulter"], ["Seitliche Schulter", "Trizeps"]],
  [/rudern von oben|klimmz|latzug|pull.?(up|down)|überzüge|pullover/i, ["Lat"], ["Oberer Rücken", "Bizeps"]],
  [/rudern|row\b/i, ["Oberer Rücken", "Lat"], ["Bizeps", "Hintere Schulter"]],
  [/shrug|nackenheben/i, ["Trapez"], []],
  [/hammer/i, ["Brachialis", "Bizeps"], ["Unterarme"]],
  [/preacher|konzentration/i, ["Bizeps"], []],
  [/curl/i, ["Bizeps"], ["Unterarme"]],
  [/beinbeuger|leg curl/i, ["Beinbeuger"], []],
  [/beinstrecker|leg extension/i, ["Quadrizeps"], []],
  [/hip thrust/i, ["Gesäß"], ["Beinbeuger"]],
  [/adduktor/i, ["Adduktoren"], []],
  [/abduktor/i, ["Abduktoren"], ["Gesäß"]],
  [/waden|calf/i, ["Waden"], []],
  [/split squat|ausfallschritt|lunge/i, ["Quadrizeps", "Gesäß"], ["Beinbeuger"]],
  [/kniebeug|squat/i, ["Quadrizeps", "Gesäß"], ["Adduktoren", "Unterer Rücken"]],
  [/beinpresse|hackenschmidt|leg press/i, ["Quadrizeps"], ["Gesäß"]],
  [/crunch|beinheben|plank|bauch/i, ["Bauch"], []],
];

export function musclesFor(name) {
  const hit = RULES.find(([re]) => re.test(name));
  return hit ? { primary: hit[1], secondary: hit[2] } : null;
}

// Öffnet die YouTube-Suche zur Übung (Klammerzusatz wie „(Kabel)“ bleibt für die passende Variante drin)
export const videoUrl = name =>
  "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${name.replace(/[()]/g, "")} richtige Ausführung`);
