# BikeFit für Einsteiger: Aufnahme zuerst, Auswertung danach

Stand: 14. September 2026. Ausgangsbasis: `c9cbc25` plus die lokalen Kamera-/Pose-Korrekturen dieses Pushs.

**Entscheidungsvorschlag für die nächste Entwicklung:** Die iPhone-Kamera beibehalten. Einen neuen Standardablauf mit drei Schritten bauen: **Einrichten → 40 Sekunden aufnehmen → Ergebnis ansehen**. Die Auswertung läuft nach der Aufnahme. Manuelle Fahrradpunkte und Pedalmarker werden im Einsteigermodus nicht vorausgesetzt. Optionale KI erklärt überprüfte Beobachtungen und hilft bei Aufnahmeproblemen.

Dies ist ein Entwicklungsauftrag, keine Behauptung, dass dieser Ablauf bereits existiert. Die heutige Version ist nach dem gescheiterten Selbsttest **noch nicht für unbeaufsichtigte Einsteiger freigegeben**. Die technische Erkennung kann funktionieren, während der gesamte Nutzerablauf trotzdem scheitert.

Die einzeln beauftragbaren Arbeitspakete mit Abnahmekriterien stehen in [ENTWICKLUNGSPAKETE_2026-09-14.md](ENTWICKLUNGSPAKETE_2026-09-14.md). Bei Zielkonflikten haben deren Aufnahme-, Methoden- und Datenverträge Vorrang vor älteren P0-Ablaufbeschreibungen. Die bisherigen Genauigkeits- und Freigabegrenzen gelten weiterhin.

## 1. Was der Selbsttest tatsächlich gezeigt hat

| Beobachtung / Codebefund | Bedeutung für das Produkt |
| --- | --- |
| Die iPhone-Continuity-Kamera lieferte ein brauchbares Kamerabild. | Diese Quelle bleibt der bevorzugte Live-Einstieg. |
| MediaPipe meldete einen `Packet timestamp mismatch`; der Worker lieferte keine Pose mehr. Nach dem Fix und vollständigen Neuladen waren wieder Live-Landmarken sichtbar. | Eine wieder sichtbare Pose ist noch keine erfolgreich abgeschlossene Messung. Wiederanlauf und End-to-End-Ablauf müssen separat abgenommen werden. |
| Im engen Ausschnitt fehlten Füße bzw. Teile der Beinlinie. Nach einem weiteren Bildausschnitt zeigte der Körpercheck Hüfte, Knie und Knöchel als sichtbar. | Die App muss vor der Aufnahme bei der Kameraposition helfen. „Person erkannt“ reicht als Freigabe nicht. |
| Die aktuell verwendete iPhone-Kamera stellte in Brave keinen durch die App steuerbaren Zoom bereit. | Ein 0,5×-Button kann nicht universell versprochen werden. macOS-Steuerung und ein einfacher Dateiweg sind erforderlich. |
| Der Nutzer konnte den gesamten Ablauf trotz Hilfestellung nicht abschließen. Die zuletzt beobachtete Oberfläche wartete noch auf den Pedalbezug. | Der Erfolg muss an einer selbstständig nutzbaren Auswertung gemessen werden, nicht an grünen Modulchecks. |
| `src/flow/screens/BodyScreen.tsx` hängt den notwendigen Pedal-Dialog in „Diagnose“ ein. Im Hauptbereich ist gleichzeitig ein Testknopf „Pose-Verlust prüfen“ sichtbar. | Wichtige Bedienung ist schwer auffindbar; Entwicklerfunktionen stören den normalen Ablauf. |
| `FlowPrimary.tsx` benutzt bei einem Pose-Fehler dieselbe Wiederholen-Aktion wie bei Kamera-Problemen. `restart()` in `FitSession.tsx` startet die Kamera, nicht die Pose-Engine. | Die sichtbare Fehlerbehebung kann am falschen Teil des Systems ansetzen. |
| `src/calibration/detect.ts` ist ausdrücklich ein Farb-/Silhouettenprototyp und sucht goldfarbene Pixel. | Das ist keine allgemeine Erkennung beliebiger Fahrräder oder Indoor-Bikes. |
| Produktive `MediaRecorder`-Aufnahme fehlt; die gefundene Nutzung ist im Datei-Test. Dateiimport existiert, führt aber durch den bisherigen Messablauf. | „Video zuerst aufnehmen, dann automatisch auswerten“ ist ein eigenes Entwicklungspaket. Ein vorhandener Datei-Button genügt nicht. |
| `MetricsFrame` setzt Pedalsamples voraus; die Standard-Kniebeugung ist an den unteren Pedaltotpunkt gebunden. | Markerfreiheit braucht eine neue Messmethode und Datenverträge. Nur die UI-Sperre zu entfernen wäre fachlich falsch. |

Die Befunde zur Nutzung stammen aus einem begleiteten Einzeltest. Es gibt noch keine belastbare Erfolgsquote für Einsteiger und keinen unabhängigen Genauigkeitsnachweis aus dieser Sitzung. Personenbilder oder Videos aus dem Test werden diesem Repository nicht beigefügt.

## 2. Der neue Standardablauf

### Schritt 1: Kamera einrichten

Der Einstieg bietet „Mit iPhone/Webcam aufnehmen“ und „Vorhandenes Handyvideo auswählen“. Der bisherige Ablauf bleibt über „Erweiterte Messung“ erreichbar.

- Die App zeigt ein einfaches Beispiel für die seitliche Kameraposition und einen großen Bildrahmen. Hüfte, Knie und der gesamte Fuß sollen während des Tretens sichtbar bleiben; für zusätzliche Oberkörperwerte müssen auch deren Gelenke sichtbar sein.
- Eine kurze automatische Vorprüfung nennt jeweils **eine** Handlung: etwa „Kamera weiter weg“, „Mehr Licht“ oder „Kamera gerade stellen“. Ein Hinweis bleibt einige Sekunden stabil und wechselt nicht mit jedem Frame.
- Bei Continuity wird eine vorhandene Kamera-Zoomfunktion genutzt. Falls der Browser sie nicht anbietet, führt eine aufklappbare visuelle Anleitung zur macOS-Videosteuerung. Nach einer erfolglosen Einrichtung wird unmittelbar der Handyvideo-Weg angeboten.
- 0,5× ist eine Möglichkeit für mehr Bildinhalt, kein genereller Genauigkeitsgewinn. Das neue Sichtfeld und mögliche Randverzerrung werden geprüft. Wenn möglich, ist mehr Abstand mit ruhiger Kamera die Alternative. Die Methode muss an beiden Bildausschnitten validiert werden.
- Die App fordert keine Kenntnis von Tretlager, Hoods, B/S/G, Seed oder Worker. Für die Basismessung müssen Nutzer nichts anklicken oder am Pedal befestigen.

### Schritt 2: Aufnahme

Eine große Aktion „Aufnahme vorbereiten“ startet einen 10-Sekunden-Countdown, optional 20 Sekunden. Anschließend werden standardmäßig 40 Sekunden Video aufgezeichnet; Start und Ende werden hörbar und sichtbar signalisiert. Das Mikrofon bleibt aus. Während des Tretens ist keine Bedienung am Mac nötig.

Die Aufnahme endet zeitgesteuert, auch wenn die Live-Pose ausfällt. Live-Erkennung ist eine Hilfe für die Einrichtung und darf die Speicherung nicht anhalten. Danach zeigt die App „Video gespeichert – wird ausgewertet“. Ein Abbruch oder ein Analysefehler darf einen bereits gespeicherten Clip nicht vernichten.

**Gleichwertiger Rückfallweg:** In der normalen iPhone-Kamera ein seitliches Video aufnehmen, bei Bedarf dort 0,5× wählen, per AirDrop auf den Mac übertragen und in BikeFit öffnen. Der importierte Clip geht direkt in denselben Analyseauftrag. Ein Safari-Livestream, QR-Pairing oder ein Cloud-Upload sind dafür nicht notwendig.

### Schritt 3: Ergebnis

Die App zeigt das aussagekräftigste Standbild mit Gelenklinien, den ausgewerteten Zeitabschnitt und wenige verständliche Beobachtungen. Der erste Schwerpunkt ist die Kniebewegung. Weitere Werte erscheinen nur, wenn ihre eigenen Voraussetzungen erfüllt sind.

Es gibt drei Ergebnisse: **auswertbar**, **teilweise auswertbar** oder **neu aufnehmen**. Eine fehlende Ellbogenmessung sperrt eine brauchbare Kniemessung nicht. Eine fehlende Kniekette darf umgekehrt nicht durch eine schöne KI-Zusammenfassung als erfolgreiche Bikefit-Messung erscheinen.

Bei unbrauchbarem Material nennt die App den Hauptgrund, zeigt einen Beleg und bietet „Mit diesem Hinweis erneut aufnehmen“. Bei brauchbarem Material sind „Gleichen Clip neu auswerten“, „Vergleichen“ und „Speichern“ erreichbar. Ein erneuter Versuch verwendet dieselben Bytes, solange keine neue Aufnahme gewählt wurde.

## 3. Welche Aufgabe KI bekommt

Die App benutzt bereits KI: MediaPipe ermittelt Körperlandmarken. Für den neuen Ablauf werden drei Aufgaben getrennt implementiert:

| Aufgabe | Zuständige Komponente | Erwartetes Ergebnis |
| --- | --- | --- |
| Zeitstempel, Körperpunkte, Gelenkwinkel, Wiederholungen, gültige Abschnitte | Lokale Video-/Pose-/Messpipeline | Nachrechenbare Werte und klar ausgewiesene Lücken |
| Aufnahmeprobleme und auffällige Szenen einordnen | Lokale Qualitätsprüfung; optional Bild-KI | Beleggebundene Hinweise wie verdeckter Fuß oder schräger Blickwinkel |
| Messwerte und freigegebene Handlungshinweise verständlich erklären | Zunächst Textvorlagen, optional GPT-5.6 Luna | Kurze deutsche Erklärung mit Referenzen auf Messwerte und Bilder |

**Luna ist ein sinnvoller Evaluationskandidat, aber noch kein belegter Qualitätsgewinner für BikeFit.** Die aktuelle offizielle Modellseite nennt Text- und Bildeingaben sowie strukturierte Ausgaben. Direkte Videoeingabe wird nicht unterstützt. Daher zerlegt die lokale Pipeline den Clip; an Luna gehen nur ausgewählte Bilder mit expliziten Zeitstempeln und ein kompakter Messbericht. Die Videoanalyse bleibt eine Leistung der Gesamtanwendung. [Luna-Modell](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Bildeingaben](https://developers.openai.com/api/docs/guides/images-vision).

Die KI erhält im ersten Paket höchstens zwölf einzeln beschriftete Belegbilder und freigegebene Metriken. Sie darf keine fehlenden Winkel, Körperpunkte, Referenzlängen oder Pedalphasen ergänzen. Räumliche Lokalisierung und Bilder mit starker Verzerrung sind ausdrücklich Grenzen allgemeiner Vision-Modelle; deshalb wird GPT nicht zur alleinigen Quelle präziser Geometrie. [Offizielle Vision-Grenzen](https://developers.openai.com/api/docs/guides/images-vision#limitations).

Luna-Ausgaben verwenden ein strukturiertes Schema. Eine zweite, lokale Prüfung kontrolliert trotzdem Referenzen und Inhalt: Schema-Konformität belegt keine fachliche Richtigkeit. Zahlen werden durch die Ergebnisoberfläche aus dem Messbericht eingesetzt. Verfügbare Einstellhinweise stammen aus versionierten, freigegebenen Regeln. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Ein größeres Modell wird nur als Vergleich auf demselben privaten Testdatensatz eingesetzt, wenn Luna die definierten Kriterien verfehlt. Auswahl nach beobachteter Qualität, Latenz und Kosten; keine automatische Qualitätsbehauptung aufgrund des Modellnamens.

## 4. Messung ohne Pflichtmarker: Methodenentscheidung

Ein sagittaler Hüfte–Knie–Knöchel-Winkel lässt sich in Bildkoordinaten berechnen, ohne drei Fahrradpunkte manuell anzuklicken. Das löst aber weder Perspektivfehler noch Verdeckungen und liefert noch keine verifizierte Kurbelphase.

Der Einsteigermodus bekommt deshalb als eigene Methode `max_extension`: Kniebeugung im zuverlässig beobachteten Bereich größter Beinstreckung, pro erkanntem Bewegungszyklus aggregiert. Zykluserkennung erfolgt anhand der zeitlichen Bein-/Knöchelbewegung. Das ist **nicht automatisch** der Winkel am unteren Pedaltotpunkt. Einzelne Ausreißer-Minima dürfen den Wert nicht bestimmen.

Die existierende Methode `bottom_dead_center` bleibt unverändert an eine zuverlässige Kurbelphase gebunden. Ihre Zielbänder werden nicht auf `max_extension` übertragen. Für die neue Methode gibt es bis zur methodenspezifischen fachlichen Freigabe numerische Beobachtungen und Vergleichsbilder, aber keine daraus abgeleitete Sattelhöhenbewertung. Die Pilotversion muss genau so benannt werden; ein offener Methodenbenchmark ist kein fertiges Bikefitting.

Für den Einstieg ist eine vollständig erkannte Kniekette das minimale numerische Ergebnis. Oberkörperneigung erfordert zusätzlich eine vertrauenswürdige Horizontale; Schulter-/Ellbogenwerte benötigen ihre eigenen Gelenke. Fehlende Referenzen ergeben eine gezielte Einschränkung dieser Metrik. Der Rumpfwinkel darf nicht stillschweigend gegen einen unbekannt schiefen Bildrand gemessen werden.

## 5. Fahrrad- und Rahmenerkennung

Automatische Erkennung bleibt sinnvoll, wird aber kein Pflicht-Gate vor der ersten Aufnahme. Fahrradklasse, Rahmenkontur, Tretlagerzentrum, Sattelkontakt und Handkontakt sind verschiedene Aufgaben. Ein Indoor-Bike ohne sichtbare Laufräder, ein verdecktes Tretlager oder Hände auf einem Lenker sind keine eindeutigen Referenzpunkte.

Die nächste Umsetzung soll mehrere Originalframes nutzen, Kandidaten über die Zeit vergleichen und Unsicherheit erhalten. Ein allgemeiner Fahrraddetektor ersetzt den Goldpixel-Prototyp erst nach einem Benchmark. Ein gut sichtbarer Punkt kann als Vorschlag vorliegen; ein verdeckter bleibt unbekannt. Bei nötiger Korrektur sieht der Nutzer ein gut vergrößerbares Standbild mit höchstens einem klar benannten Punkt pro Schritt. Im Einsteigermodus bleibt die Basisauswertung auch ohne diese Punkte erreichbar.

## 6. Lokaler Modus und optionale Cloud

Der erste nutzbare Ablauf funktioniert lokal. „KI-Erklärung ergänzen“ ist eine gesonderte Aktion nach der lokalen Auswertung. Vor dem ersten Senden zeigt die App die tatsächlich ausgewählten Bilder, Empfänger und Datenarten. Ablehnen lässt das lokale Ergebnis vollständig nutzbar.

Das bisherige pauschale „Kein Upload“ muss bei eingeführter Cloud-Funktion präzisiert werden: „Video bleibt lokal. Ausgewählte Bilder und Messwerte werden nur nach deiner Freigabe für die KI-Erklärung gesendet.“ Metadaten wie EXIF und nicht benötigte Gerätekennungen werden entfernt. Rohclips und private Testbilder gehören weder in GitHub noch in Fehlerprotokolle.

Der API-Schlüssel liegt serverseitig. Geplant sind kurze Aufträge ohne Anbieter-Dateiablage, `store: false`, serverseitige Größen-/Kostenlimits und ein jederzeit erreichbarer lokaler Rückfall. `store: false` ist keine Zusicherung absoluter Nullspeicherung: OpenAI unterscheidet Anwendungszustand und standardmäßig bis zu 30 Tage aufbewahrte Missbrauchsprotokolle; gesonderte Retentionskontrollen haben eigene Voraussetzungen und Ausnahmen. Das muss vor einer Cloud-Freigabe mit der konkreten Projektkonfiguration abgeglichen werden. [OpenAI-Datenkontrollen](https://developers.openai.com/api/docs/guides/your-data).

In diesem Auftrag werden keine Aufnahmen an OpenAI gesendet und keine Cloud-Infrastruktur ausgerollt. Die KI-Integration ist als Entwicklungspaket definiert.

## 7. Reihenfolge, Aufwand und Freigabe

Personentage sind Planungsspannen für erfahrene Entwickler inklusive Pakettests, keine Lieferzusage. Datensatzbeschaffung und externe fachliche Begutachtung können zusätzliche Kalenderzeit benötigen.

| Paket | Priorität | Inhalt | Aufwand | Voraussetzung |
| --- | --- | --- | --- | --- |
| AP-00 | geliefert | Bisherige Pose-/Zoom-/Knöchelkorrekturen mit diesem Push | vorhanden | — |
| AP-01 | P0 | Übergangs-UX, korrekte Fehlerbehebung, Setup-Invalidierung | 2–3 PT | AP-00 |
| AP-02 | P0 | Lokale Aufnahme und einfacher Handyvideo-Import | 4–6 PT | gemeinsame Verträge |
| AP-03 | P0 | Wiederholbare Auswertung gespeicherter Clips | 5–8 PT | AP-02-Vertrag |
| AP-04 | P0 | Verständliche Kamera-/Ausschnittprüfung | 3–5 PT | AP-02, AP-03-Qualitätsvertrag |
| AP-05 | P0 | Markerfreie Knieauswertung als eigene Methode | 7–12 PT | AP-03, AP-09-Datensatz |
| AP-06 | P0 | Ergebnis, Wiederholung und Vergleich im einfachen Ablauf | 3–5 PT | AP-03, AP-05 |
| AP-07 | P1 | Optionaler Luna-Erklärdienst und Vergleich | 4–7 PT | AP-06, AP-09-Belege |
| AP-08 | P1 / Forschung | Allgemeine Fahrradreferenzen aus mehreren Frames | 2 PT Machbarkeit; danach 5–10 PT Schätzung | AP-03, AP-09-Datensatz |
| AP-09 | P0 / durchgehend | Realvideos, fachliche Prüfung und Einsteiger-Abnahme | 5–8 PT plus Datenerhebung/Begutachtung | beginnt sofort |

Der lokale Kern AP-01 bis AP-06 plus AP-09 liegt damit bei **29–47 Personentagen**. Bei zwei Entwicklern sind etwa **4–6 Kalenderwochen für einen Pilot** eine erste Arbeitshypothese, wenn Testmaterial früh verfügbar ist; AP-05 und reale Nutzertests bestimmen den kritischen Pfad. Cloud-KI und allgemeine Rahmenerkennung dürfen diesen ersten Pilot nicht blockieren.

Empfohlene Lieferungen:

1. **Lieferung A:** AP-01, AP-02 und der Start von AP-09. Ergebnis: allein aufnehmen oder ein vorhandenes Handyvideo einlesen, Material bleibt erhalten. Noch keine Behauptung einer automatischen Messung.
2. **Lieferung B:** AP-03 bis AP-06, gegen AP-09 geprüft. Ergebnis: erster markerfreier lokaler Pilot mit ehrlicher Methodenkennzeichnung.
3. **Lieferung C:** AP-07 nach nachgewiesenem Mehrwert. AP-08 unabhängig fortsetzen; bei ungenügender Referenzgenauigkeit beim optionalen Expertenpfad bleiben.

Ein QR-gekoppelter mobiler Recorder wäre später möglich. Er ist ausdrücklich nicht Bestandteil dieser ersten Lieferung: Eine Website auf dem iPhone kann nicht einfach den Mac-Loopback `127.0.0.1` benutzen, und Browserkamera-Zugriff benötigt eine passende sichere Bereitstellung. Continuity plus nativer Handyvideo-Import lösen den ersten Bedarf bereits.

## 8. Wann ist es für Einsteiger nutzbar?

Die Abnahme erfolgt mit mindestens zehn Personen ohne BikeFit-Vorwissen auf echten eigenen Kamerabildern. Entwickler dürfen während des ersten Versuchs nicht helfen. Ein zugeschnittenes Demovideo zählt nicht.

- Mindestens 8 von 10 erreichen innerhalb von fünf Minuten ein tatsächlich auswertbares Knie-Ergebnis ohne Entwicklerhilfe und ohne Pflichtmarker. Mindestens 9 von 10 nach höchstens einer angeleiteten Wiederholung.
- Nach Beginn des Countdowns ist keine Bedienung während des Tretens nötig.
- Ein unbrauchbares Video erzeugt innerhalb derselben Zeitgrenze einen konkreten, verständlichen Wiederholungsauftrag; es zählt als korrekt abgefangener Fehler, aber **nicht** zur Quote erfolgreicher Knie-Ergebnisse.
- Import, Analysefehler, Wiederholen, Speichern und Vergleich funktionieren ohne Aufnahmedatenverlust. Kein normaler Schritt erfordert „Diagnose“.
- Messgenauigkeit und Wiederholbarkeit bestehen den separaten Benchmark aus AP-09. Eine funktionierende Oberfläche allein reicht dafür nicht.
- Cloud ablehnen oder kein Internet haben verhindert die lokale Auswertung nicht. KI-Ausgaben zeigen keine ungestützten Zahlen oder Einstellhinweise.

Diese Kriterien sind Zielwerte für die Entwicklung, keine bereits gemessenen Produkteigenschaften. Erst nach bestandener Abnahme lautet die Freigabe „für selbstständigen Einsteigertest geeignet“. Die weitergehende fachliche Freigabe von Einstell-Empfehlungen erfolgt getrennt.

## 9. Was dieser Push konkret enthält

- Strikt steigende Inferenz-Zeitstempel im Pose-Engine-Eingang, einschließlich Wiederholung, Rücksprung und Kamera-Session-Wechsel im Regressionstest.
- Detaillierter Worker-Fehler in der Diagnose einschließlich ausgeführtem Delegate und zuletzt gesehenen Inferenz-Zeitstempeln.
- Knie-Sichtcheck verlangt jetzt auch den Knöchel; sichtbarer Hinweis bei unvollständiger Beinlinie.
- Fähigkeitserkennung für echten Kamera-Zoom; angebotene Werte werden angewendet und zurückgelesen. Ist Zoom nicht verfügbar, erscheint eine Continuity-Anleitung.
- Dieser Maßnahmenplan und die beauftragbaren Entwicklungspakete.

Die Korrekturen ersetzen AP-01 bis AP-09 nicht. Insbesondere automatischer Wiederanlauf, vollständige Setup-Invalidierung nach Sichtfeldänderung, einsteigerfreundliche Aufnahme und markerfreie Analyse sind weiterhin Entwicklungsarbeit. Das KI-Paket wurde noch nicht implementiert.

Verifikation des Livefix-Stands: `npm run build`, `npm run pose:harness` (9 Pose- und 12 Overlay-Checks), `npm run flow:harness` (76 Checks), `npm run lint` (bestehende Warnungen) und `file:mounted` mit dem installierten Chrome erfolgreich. Der Headless-Dateitest läuft ohne GPU und ist kein Nachweis echter Pose-Genauigkeit. Zusätzlich wurde die reale Continuity-Ansicht mit sichtbarer Pose beobachtet; ein selbstständig abgeschlossener Messdurchlauf wurde nicht erreicht.
