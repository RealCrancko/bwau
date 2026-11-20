# BWAU auf dem iPhone

## Mit Freunden über den Link trainieren

Öffnet [BWAU](https://realcrancko.github.io/bwau/) in Safari und fügt es über das Teilen-Menü zum Home-Bildschirm hinzu. Jeder meldet sich mit seinem eigenen BWAU-Konto an. Unter **Profil → Benachrichtigungen** könnt ihr den Pausenhinweis aktivieren und bei gesperrtem Gerät testen. iOS verwaltet den Ton unter **Einstellungen → Mitteilungen → BWAU**.

Für den Uhr-Timer auf dem Sperrbildschirm und auf iPhones mit Dynamic Island öffnet im Profil **Uhr-Timer für die Dynamic Island**. Eine Person erstellt den dort beschriebenen Kurzbefehl **BWAU Pause** und teilt ihn aus Apples Kurzbefehle-App mit der Gruppe. Alle übernehmen ihn unter genau diesem Namen. Probiert im Profil den Zehn-Sekunden-Test. Schaltet im selben Bereich **Uhr beim Abhaken automatisch starten** ein. Ab dann ruft das Abhaken eines gültigen Satzes direkt den Kurzbefehl auf. iOS kann eine Bestätigung anzeigen. Ohne Automatik könnt ihr während einer Satzpause auf **Uhr** tippen. Spätere Änderungen an diesem separaten Timer erfolgen in der Uhr-App. Den Alarmton legt ihr dort unter **Timer-Ende** fest.

## Automatische Live-Aktivität mit Xcode

Die native iPhone-App öffnet dieselbe BWAU-Website mit denselben Konten. Sie startet die Live-Aktivität und plant eine lokale Mitteilung, wenn ein Satz abgehakt wird. Änderungen an der Pausenzeit, Überspringen und Trainingsende werden übernommen. Der Timer zählt auch auf dem Sperrbildschirm herunter. Wenn iOS die App im Hintergrund anhält, kann die abgelaufene Aktivität bis zum nächsten Öffnen als erledigt sichtbar bleiben.

1. Lade auf dem Mac eine mit deinem iPhone kompatible Version von Xcode aus dem Mac App Store. Lade dieses Repository herunter und öffne **ios/BWAU.xcodeproj**.
2. Melde dich unter **Xcode → Settings → Accounts** mit deinem Apple Account an. Ersetze in **Signing.xcconfig** die Kennung durch eine eigene eindeutige Kennung. Die Erweiterung erhält automatisch die Endung „.pause“.
3. Wähle im Projekt unter **Signing & Capabilities** für beide Targets **BWAU** und **PauseLive** dein **Personal Team**. Verbinde das iPhone, bestätige die Vertrauensabfrage und aktiviere bei Aufforderung den Entwicklermodus.
4. Wähle oben das Schema **BWAU** und dein iPhone, dann **Run ▶**. Melde dich mit deinem bestehenden BWAU-Konto an und erlaube Mitteilungen. Du kannst unter **Profil → Ton testen** einen Test auslösen. Für die Live-Aktivität müssen Live-Aktivitäten auf dem Gerät für BWAU erlaubt sein.
5. Prüfe bei einem Training das Abhaken, Verlängern, Verkürzen und Überspringen. Sperre das Display während einer Pause. Auf einem iPhone mit Dynamic Island erscheint der Countdown auch dort, sobald du die App verlässt.

Die kostenlose persönliche Signierung gilt sieben Tage. Danach erstellt und installiert ihr den Build mit Xcode erneut. Die Web-Version mit Kurzbefehl hat diese Frist nicht. [Apple zu Personal Teams](https://developer.apple.com/help/account/basics/about-your-developer-account/)
