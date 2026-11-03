# BWAU einrichten

Einmalig etwa 10 Minuten. Danach öffnen deine Freunde einfach den Link, registrieren sich mit Name und PIN und los geht's.

## 1. Supabase (die Datenbank)

1. Auf [supabase.com](https://supabase.com) anmelden und **New project** anlegen. Name `bwau`, Region **Frankfurt (eu-central-1)**.
2. Links **SQL Editor** öffnen, **New query**, den kompletten Inhalt von `supabase/schema.sql` einfügen und **Run** drücken. Es sollte „Success“ kommen.
3. Links **Authentication**, dann **Sign In / Providers**, dann **Email**:
   - **Confirm email** ausschalten (sonst klappt die Anmeldung mit Name und PIN nicht).
   - **Speichern**.
4. Links **Project Settings**, dann **API** (bzw. **Data API** und **API Keys**). Dort stehen:
   - **Project URL**, z. B. `https://abcdefgh.supabase.co`
   - **anon / public key**, ein langer Text, der mit `eyJ` anfängt (oder `sb_publishable_...`)

Diese zwei Werte gibst du Claude, oder du trägst sie selbst in `js/config.js` ein. Der anon-Key ist dafür gedacht, öffentlich in der App zu stehen. Den **service_role**-Key aber niemals weitergeben.

## 2. GitHub Pages (die Website)

Claude lädt den Ordner als Repository hoch und schaltet Pages ein. Danach ist die App erreichbar unter
`https://<dein-github-name>.github.io/bwau/`.

## 3. Auf dem iPhone

Link in **Safari** öffnen, auf **Teilen** tippen, dann **Zum Home-Bildschirm**. BWAU startet dann im Vollbild wie eine App.

## Gut zu wissen

- **Sicherheit:** Name und PIN reichen für eine Freundesgruppe. Eine 4-stellige PIN ist aber kein starkes Passwort. Supabase bremst zu viele Fehlversuche, trotzdem nichts Geheimes in der App speichern.
- **Wer sieht was:** Alle Angemeldeten sehen Feed, Rangliste und geteilte Pläne. Ändern kann jeder nur seine eigenen Daten.
- **Wer sich anmelden kann:** Jeder, der den Link hat. Gib ihn also nur an deine Freunde.
- **Kosten:** Supabase Free reicht locker. Kostenlose Projekte werden nach 7 Tagen ohne Nutzung pausiert und lassen sich im Supabase-Dashboard mit einem Klick wieder starten.
- **Demo-Modus:** Solange `js/config.js` leer ist, läuft die App ohne Datenbank, nur im eigenen Browser.

## Lokal testen

```bash
node tools/serve.mjs
```

Dann http://localhost:5173 öffnen.


