# BikeFit starten — Testhilfe

Die App läuft nur auf dem **Mac**, in **Google Chrome**, unter der festen Adresse **http://127.0.0.1:47321**. Nicht `localhost` schreiben — gespeicherte Messungen hängen an dieser Adresse.

## Getestete Kombination

| Teil | Vorgabe |
| --- | --- |
| Computer | Mac mit aktuellem macOS |
| Browser | Google Chrome (aktuell). Nicht Safari, nicht Firefox |
| Telefon | iPhone als Continuity-Kamera, entsperrt, neben dem Mac |
| Verbindung | Dieselbe Apple-ID, WLAN und Bluetooth an, Continuity-Kamera am iPhone erlaubt |
| Wo die App läuft | Nur im Chrome-Fenster auf dem Mac, nicht im iPhone-Safari |

## Einmalig (Hilfe vom Entwickler ist ok)

1. Google Chrome installieren.
2. Node.js 22 LTS installieren (https://nodejs.org).
3. Dieses Repository einmal auf den Mac holen.
4. Im Terminal **einmal**:

```bash
cd /Pfad/zu/bikefitting
npm run setup:local
```

Das installiert Abhängigkeiten, baut die getestete Version und legt **BikeFit starten** auf den Schreibtisch (`.command`, auf dem Mac zusätzlich eine `.app` wenn möglich). Im Ordner liegt außerdem `BikeFit starten.command`.

## Ab dann — auch nach einem Neustart

1. **BikeFit starten** doppelklicken.
2. Chrome öffnet sich von selbst unter http://127.0.0.1:47321.
3. Kein Terminal, kein Port, kein `npm install`.

Läuft BikeFit schon, öffnet der Starter nur Chrome. Es wird kein zweiter Server gestartet.

## Wo Live und gespeicherte Ergebnisse liegen

- **Live:** Startseite → **Mit Kamera messen**.
- **Gespeichert:** Startseite, Karte **Gespeicherte Messungen**.
- Die getestete Version und der Commit stehen oben rechts unter **Hilfe**.

## Wenn etwas anderes den Port nutzt

Der Starter beendet fremde Programme nicht. Es erscheint eine Meldung mit PID und Programmname. Das andere Programm schließen, danach erneut **BikeFit starten**.

## Typische Störungen

Die gleichen Texte stehen in der App unter **Hilfe**.

**Verbindung verloren.** Erneut **BikeFit starten**. Nach einem Mac-Neustart denselben Starter verwenden. Adresse bleibt http://127.0.0.1:47321.

**Kamera: Berechtigung verweigert.** Chrome: Schloss in der Adresszeile → Website-Einstellungen → Kamera → Zulassen. Zusätzlich: Systemeinstellungen → Datenschutz & Sicherheit → Kamera → Google Chrome.

**Kamera belegt.** FaceTime, Photo Booth, Zoom, Teams und andere Kamera-Apps schließen. Das iPhone nicht parallel in einer zweiten Mac-App als Kamera verwenden.

**iPhone nicht sichtbar.** iPhone entsperren und neben den Mac legen. Mac-Menüleiste → Video → Kamera iPhone. In Chrome das Gerät wählen, bevor die Messung startet. Center Stage aus. Bluetooth/WLAN prüfen, Energiesparmodus aus, iPhone kurz neu starten.

Safari bleibt außerhalb. Aufnahme-Recorder und Offline-Analyse (AP-10/AP-02/AP-03) sind nicht Teil dieses Starters.
