// Neue Versionsnummer an alle Datei-Links hängen, damit Browser nach einem Update nichts Altes aus dem Cache nehmen.
// Vor jedem Hochladen ausführen: node tools/bump.mjs
import fs from "fs";
const v = Date.now().toString(36);
const files = ["index.html", "js/app.js", "js/api.js"];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8")
    .replace(/((?:src|href)="(?:js\/app\.js|style\.css|manifest\.webmanifest))(?:\?v=\w+)?"/g, `$1?v=${v}"`)
    .replace(/(from "\.\/(?:api|logic|config)\.js)(?:\?v=\w+)?"/g, `$1?v=${v}"`);
  fs.writeFileSync(f, s);
}
console.log("Version", v);
