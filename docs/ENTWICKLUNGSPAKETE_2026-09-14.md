# Beauftragbare Entwicklungspakete: BikeFit-Einsteigermodus

Stand: 14. September 2026. Produktentscheidung und Begründung: [Maßnahmenplan](AMATEUR_MVP_PLAN_2026-09-14.md).

Jedes Paket ist als eigener PR lieferbar. Vorhandene Dateien unten sind Einstiegspunkte; mit **neu** markierte Pfade sind vorgeschlagene Zielmodule. Die Aufwände sind Personentage inklusive Implementierung und Pakettests. Priorität P0 bezeichnet hier den kritischen Lieferumfang für den Einsteigerpilot.

## Gemeinsamer Vertrag – vor den parallelen Implementierungen festlegen

**Verantwortlich:** technischer Lead aus AP-02/AP-03, Review durch AP-05/AP-06. Innerhalb des AP-02-Aufwands liefern. AP-09 beginnt sofort mit Material und Testprotokoll.

### A. Aufnahme und Analyse sind verschiedene Objekte

- `CaptureAsset`: unveränderliche Originalbytes plus `captureId`, `blobKey`, Inhalts-Hash, MIME/Codec, Dauer, Originalabmessungen, Orientierung und Aufnahmetyp (`continuity`, `webcam`, `phone_import`, `file_import`). Keine kurzlebigen Object-URLs als dauerhafte Identität speichern.
- `CaptureGeometry`: `geometryRevision`, Originalraum, explizite Rotation/Crop, Quelle, gemeldeter Zoom oder `null`; eine vom Nutzer angegebene Linse separat als `userReportedLens`. Keine vermeintlich gemessene 0,5×-Metadaten aus dem Gerätenamen erfinden.
- `AnalysisJob`: `jobId`, `captureId`, Eingabe-Hash, `pipelineVersion`, Modell-/WASM-Hash, vollständige Optionen und Status. Neuer Auftrag bei anderer Konfiguration; gleicher Auftrag darf idempotent fortgesetzt werden.
- Aufnahmezustände: `idle → preparing → countdown → recording → finalizing → saved`; zusätzlich `cancelled` und `failed`. `saved` gilt erst nach erfolgreichem Persistieren und Prüfen des finalen Clips.
- Analysezustände: `queued → decoding → pose → selecting_segment → measuring → done`; zusätzlich `cancelled` und `failed`. Fortschritt kommt aus verarbeiteten Medienframes, nicht aus frei geschätzten Prozentwerten.
- UI-Transport-Pause und Scrubbing sind unabhängig vom Analyseauftrag. Worker-Antworten mit veralteter `jobId`/Generation werden verworfen. Wiederholen startet keine neue Kameraaufnahme.

### B. Neues Ergebnisformat, bestehende Exporte bleiben lesbar

Der bisherige `MeasurementResult` v1 setzt Fahrradkalibrierung und Pedalmethoden voraus. Für den Einsteigermodus einen ausdrücklich versionierten Beobachtungsbericht anlegen, z. B. **neu** `src/types/observation.ts` mit `kind: 'bikefit.observation'`, `schemaVersion: 2`. Keine erfundenen B/S/G-Punkte, keine Typecasts, die ein kalibrierungsfreies Ergebnis als alten Messdatensatz ausgeben.

Pflichtfelder:

- Aufnahme-/Job-ID und Hash, geometrische Revision, gewählter Medienzeitraum, festgelegte Körperseite und alle Methoden-/Modellversionen.
- `status: 'usable' | 'partial' | 'retake'`, maschinenlesbare Gründe und pro Metrik eigenständige Verfügbarkeit.
- Je Metrik: `id`, `method`, `methodVersion`, Wert oder `null`, Einheit, nutzbare Zyklen, Streuung, Ausschlussgründe, referenzierte Bild-/Sample-IDs. `max_extension`, `bottom_dead_center` und `cycle_mean` bleiben verschiedene Methoden.
- `phaseSource: 'marker' | 'motion_estimate' | 'unavailable'`. Nur `marker` oder ein separat validierter zukünftiger Kurbelphasendetektor darf im jetzigen Produkt einen BDC-Wert begründen.
- Referenzbilder aus demselben Clip und Abschnitt; die exportierten Zahlen und Bilder dürfen nie aus unterschiedlichen Analyseaufträgen stammen.
- `cloudExplanation` als optionaler Anhang mit Modell, Prompt-/Schemaversion, Belegreferenzen und Übertragungsstatus. Er darf vorhandene lokale Messdaten nicht ändern.

Alte v1-Dateien werden unverändert importiert und angezeigt. Vergleich nur bei kompatibler Messmethode, Seite und Perspektivbewertung; ein Unterschied zwischen BDC und größter Streckung wird nicht als Satteländerung interpretiert.

### C. Verfügbarkeit ist fachlich pro Metrik definiert

| Metrik | Minimale Daten | Fehlende Daten bewirken |
| --- | --- | --- |
| Knie nahe größter Streckung | Sichtbare Hüfte/Knie/Knöchel derselben Seite, brauchbare Perspektive, verlässlich segmentierte Bewegung | Knie nicht verfügbar; bei fehlender Kernmetrik Wiederholungsauftrag |
| Knie am unteren Pedaltotpunkt | Zusätzlich verifizierte Kurbelphase | Kein BDC-Wert und kein BDC-Zielband |
| Rumpfneigung | Hüfte/Schulter plus verifizierte horizontale Referenz | Nur diese Metrik nicht verfügbar |
| Ellbogenbeugung | Schulter/Ellbogen/Handgelenk derselben Seite | Nur diese Metrik nicht verfügbar |
| Fußdetail | Sichtbare Ferse/Zehenspitze; eigene validierte Definition | Keine Blockade einer ansonsten brauchbaren Kniebeobachtung |
| Längenaussage | Verifizierte Skala und passende Bildebene | Keine Millimeterangabe |

Konfidenz des Landmark-Modells und IQR über Zyklen sind keine gemessene Winkelgenauigkeit. Bilder außerhalb des Bildraums, nicht-endliche Koordinaten und unzuverlässige Gelenke bleiben ungültig, auch wenn ein einzelner Visibility-Wert hoch ist.

## AP-00 – Vorhandene Livefixes nachvollziehbar übernehmen

**Status:** mit diesem Push geliefert. **Owner:** Integration. **Abhängigkeit:** keine.

**Enthaltene Dateien:**

- `src/pose/createPoseEngine.ts`, `src/pose/harness.ts`: strikt steigende Inferenzuhr und Test für gleiche/rückläufige Zeitstempel über Kamera-Session-Wechsel. Die Medienzeit bleibt im Produktpfad erhalten.
- `src/pose/pose.worker.ts`, `src/flow/components/DiagnosePanel.tsx`: konkrete Worker-Fehler und Inferenzdiagnose.
- `src/flow/bodyChecks.ts`, `src/flow/screens/CameraScreen.tsx`, `src/flow/runHarness.ts`: Knöchel als Voraussetzung der Kniekette; Hinweis bei fehlender Beinlinie.
- `src/camera/zoom.ts`, `src/camera/CameraZoomControl.tsx`: nur tatsächlich angebotene Kamera-Zoomstufen anwenden; Ergebnis zurücklesen; macOS-Anleitung bei fehlender Unterstützung.

**Nachweis:** Build, Pose-/Overlay-/Flow-Harness, Lint und montierter Datei-Browsertest erfolgreich; reale Continuity-Pose nach vollständigem Neuladen wieder sichtbar. Kein vollständiger Einsteiger-Messdurchlauf und keine allgemeine Hardware-/Genauigkeitsfreigabe.

**Offen, bewusst AP-01 zugeordnet:** UI-Wiederholung adressiert Posefehler noch nicht gezielt; ein bereits lebender Engine-Closure kann nach Vite-Fast-Refresh alten Code behalten; Zoom-/Sichtfeldänderungen sind noch nicht vollständig mit Kalibrierungsrevisionen verbunden. Für Testabnahme nach Codeupdate vollständig neu laden. AP-00 ist ein Fehlerbehebungsschritt, nicht der Einsteigerpilot.

## AP-01 – Bedienhürden und Fehlerbehebung im bestehenden Ablauf

**Priorität:** P0. **Owner:** Frontend/Integration. **Aufwand:** 2–3 PT. **Abhängigkeit:** AP-00.

**Auftrag:** Den heutigen Ablauf übergangsweise so korrigieren, dass notwendige Aktionen auffindbar sind und Wiederholen das fehlerhafte Modul wiederherstellt.

**Umsetzung:**

1. In `BodyScreen.tsx` Pedalauswahl in den Hauptbereich holen; ein großer erklärter Button plus vergrößerter Beispielpunkt. „Pose-Verlust prüfen“, Synthetic und Harness-Aktionen ausschließlich im ausdrücklichen Labormodus anzeigen.
2. `FlowPrimary.tsx` nach Fehlerart verzweigen: Posefehler → `fit.pose.retry()`, Kamerafehler → Kamera neu verbinden, Marker verloren → Marker neu auswählen. Nutzertext benennt die jeweilige Handlung. Kein dauerhafter Status „Erneut versuchen“ ohne Zustandswechsel.
3. `createPoseEngine.ts` / `FitSession.tsx`: nach fatalem Graphfehler keine weiteren Frames in denselben defekten Graph senden; höchstens ein automatischer Wiederanlauf, anschließend ein bedienbarer Fehlerzustand. Erfolg löscht alte Fehler. Offene Aufnahme-/Analysesegmente werden korrekt ungültig bzw. nach dem neuen Aufnahmevertrag neu analysiert.
4. Jede in der App ausgeführte Zoom-/Crop-/Kameraänderung erhöht die geometrische Revision und invalidiert abhängige Kalibrierung, Skala, Marker und aktive Messung. Auch ein teilweise übernommener Zoom mit anschließender Fehlermeldung darf alte Geometrie nicht freigeben. Für externe macOS-Änderungen einen sichtbaren „Bildausschnitt geändert“-Weg plus Szenenwechselprüfung vorsehen; unbekannte Lens-Metadaten bleiben unbekannt.
5. In `camera/setupId.ts`, Kalibrierungs-Binding und Scale-Binding die relevante Revision berücksichtigen. Neue Revision nicht allein aus gleicher Auflösung oder gleicher Kamera-ID ableiten.

**Abnahme:**

- Ein normaler Tester kann den Pedalmodus ohne „Diagnose“ öffnen; Testknöpfe sind im Standardablauf nicht sichtbar.
- Injizierter Posefehler: normale Wiederholen-Aktion erzeugt eine neue Engine und wieder verwertbare Frames. Kamera bleibt auswählbar. Wiederholter Fehler erzeugt keine Endlosschleife.
- Ein erfolgreich kalibriertes Bild wird in derselben Auflösung gezoomt: alte Punkte, Skala und Messfreigabe sind anschließend ungültig. Alte Ergebnisse bleiben unverändert lesbar.
- Dieselben Fälle über den montierten Provider/UI-Pfad testen; ein isolierter Helper-Test reicht für den Wiederanlauf nicht.

**Lieferung:** PR mit nachvollziehbaren UI-Schritten, Fehler-Injektionstest und kurzer Aufnahme des reparierten Ablaufs ohne private Testpersonen.

## AP-02 – Video lokal aufnehmen und Handyvideo direkt analysierbar machen

**Priorität:** P0. **Owner:** Kamera/Frontend. **Aufwand:** 4–6 PT. **Abhängigkeit:** gemeinsamer Vertrag; AP-01 kann parallel laufen.

**Bestehende Einstiegspunkte:** `camera/useCamera.ts`, `camera/constraints.ts`, `camera/attachStream.ts`, `flow/screens/StartScreen.tsx`, `file/openLocal.ts`, `file/classify.ts`, `file/providerHarness.tsx`.

**Neue Module:** `src/capture/recorder.ts`, `src/capture/storage.ts`, `src/capture/state.ts`, `src/capture/CaptureScreen.tsx`.

**Umsetzung:**

1. Produktiven `MediaRecorder` für den gewählten Videotrack implementieren. `audio: false` bleibt erhalten. Unterstützten MIME-Typ mit `isTypeSupported` wählen und einen kleinen Testclip auf der tatsächlichen Browser-/Gerätekombination dekodieren; keinen universellen WebM-/MP4-Support annehmen.
2. Zustandsautomat gemäß Vertrag A. Default: 10 s Vorlauf und 40 s Aufnahme, 20 s Vorlauf wählbar; unterstützte Aufnahmedauer 20–60 s. Start-/Endton an Nutzerinteraktion freischalten, zusätzlich große visuelle Signale. Kein Mikrofon für Sprachbefehle voraussetzen.
3. Video unabhängig vom Pose-Worker speichern. Chunks nach Möglichkeit fortlaufend in IndexedDB/OPFS ablegen; Finalisierung, Quota, Abbruch und Tab-Ende behandeln. Abgeschlossene Assets als Datei herunterladbar machen. Teilclips nur als abspielbar bezeichnen, wenn der Decoder sie tatsächlich öffnen kann.
4. Grenzen zunächst: maximal 60 s bzw. 250 MiB pro Import, Aufnahme bis 60 s; größere Dateien mit klarer Erklärung ablehnen oder ausdrücklich trimmen. Speicherbedarf vor Start schätzen, aber Persistenzerfolg trotzdem prüfen.
5. Bestehenden Dateieinstieg um „Handyvideo auswählen“ erweitern: native iPhone-Aufnahme, AirDrop, Auswahl am Mac. Nach Auswahl direkt `CaptureAsset` und Analyseauftrag anlegen; keine Pflichtreise durch B/S/G und Pedalbezug.
6. Portrait/Querformat, Metadatenrotation und MOV/HEVC prüfen. Wenn der Browser den Codec nicht dekodiert, klar benannten kompatiblen Export anbieten; keinen hängenden Analysebildschirm. Eine eventuelle lokale Transcodierung separat hinsichtlich Laufzeit/Paketgröße entscheiden.

**Abnahme:**

- Mit echter Continuity-Kamera einen Clip ohne Berührung des Macs während des Tretens erstellen. Vollständig gespeicherter Clip bleibt nach Reload wieder abspielbar.
- Pose-Worker absichtlich stoppen: Video wird trotzdem bis zum Ende gespeichert. Ein späterer Analyseversuch benutzt denselben Clip.
- Native iPhone-Aufnahme importieren; Wiedergabe und Orientierung stimmen. „Datei gewählt“ ohne tatsächlich dekodierte Frames gilt nicht als Erfolg.
- Speicher voll, Berechtigung entzogen, Kamera getrennt und ungültiger Codec führen zu konkreten Zuständen; gespeicherte andere Aufnahmen bleiben erhalten.
- Kein Audiosample in gespeicherten Medien. Netzwerkprüfung zeigt keine Medienübertragung.

**Lieferung:** Recorder, persistierbares Assetformat, neuer Einstieg und Hardware-Testprotokoll mit Codec-/Browserangaben.

## AP-03 – Gespeicherte Videos unabhängig von Wiedergabelast auswerten

**Priorität:** P0. **Owner:** Video/CV. **Aufwand:** 5–8 PT. **Abhängigkeit:** AP-02-Assetvertrag; Implementierung mit Testdateien parallel möglich.

**Bestehende Einstiegspunkte:** `pose/createPoseEngine.ts`, `pose/pose.worker.ts`, `pose/frameSync.ts`, `file/frameTransform.ts`, `metrics/pipeline.ts`, `metrics/phaseFrames.ts`, `shell/FitSession.tsx`.

**Neue Module:** `src/analysis/job.ts`, `src/analysis/decoder.ts`, `src/analysis/run.ts`, `src/analysis/segment.ts`.

**Umsetzung:**

1. Ein eigenständiger Analyseauftrag liest das gespeicherte Video. Die rVFC-Echtzeitschleife bleibt für die Vorschau; sie ist nicht der Offline-Benchmark. Decoder verarbeitet Frames mit Backpressure und dokumentierter Samplingstrategie, anfänglich Ziel 30 fps, ohne fehlende Originalframes zu erfinden.
2. Decoder über Feature-Detection wählen. Ein HTMLVideo-Seek-Fallback muss gelieferte Medienzeitstempel prüfen und Duplikate behandeln; er darf nicht behaupten, framegenau zu sein, wenn der Browser das nicht liefert. Getestete Codec-Matrix Bestandteil des PR.
3. Medienzeit für Bewegungswerte, eigene monotone Inferenzzeit pro Engine. Keine `performance.now()`-Zeitintervalle als Bewegungsgeschwindigkeit verwenden. Rotation/Crop, Originalkoordinaten und Belegbilder gemeinsam transformieren.
4. Bounded-memory-Verarbeitung: keine Liste sämtlicher RGBA-Bilder im React-State. Frames nach Verarbeitung schließen; ausgewählte Belege persistieren. Vorhandenes Pipeline-Limit `maxFrames: 900` explizit berücksichtigen: ein 40-s-/30-fps-Clip darf nicht stillschweigend auf 30 Sekunden gekürzt werden.
5. Lite und bereits lokal vorhandenes Full auf identischen Realframes vergleichen. Full als Offline-Option anbieten, wenn AP-09 einen tatsächlichen Vorteil zeigt. Keine Änderung der Mess-Sichtbarkeitsschwelle ohne eigenes Qualitätsprotokoll.
6. Stabilen zusammenhängenden Abschnitt mit gleicher Seite, ausreichender Gelenksicht und wenig Kamerabewegung auswählen. Kein Zusammenkleben günstiger Einzelbilder aus verschiedenen Haltungen. Rohsamples, ausgeschlossene Abschnitte und Gründe im Ergebnis nachvollziehbar halten.
7. Abbrechen und Wiederholen über `jobId`. Der Clip bleibt bestehen. Zwei Aufträge dürfen Ergebnisse nicht gegenseitig überschreiben. Fehler eines optionalen Cloud-Auftrags hat keine Wirkung auf diesen Auftrag.

**Abnahme:**

- Derselbe Clip unter CPU-Last und ohne Last: dieselben geplanten Medienzeitpunkte, keine lastabhängig verschwundenen Zyklen. Auf derselben Zielkonfiguration identische Auswahlen; numerische Toleranzen werden vor dem Benchmark festgelegt, nicht nachträglich passend gemacht.
- Vorschau pausieren/scrubben und UI wechseln verändert die laufende Analyse nicht. Cancel → Retry nutzt dieselben Bytes, verwirft alte Worker-Antworten und erzeugt ein konsistentes Ergebnis.
- 40-s-Clip wird vollständig besucht; Spitzen-RAM zusätzlich zur App als Ziel unter 500 MiB auf dem festgelegten Referenz-Mac. Kein dauerhafter Zuwachs nach fünf Analysen.
- Ziel nach vollständigem Eingang eines 40-s-Clips: Median Analysezeit ≤60 s, p95 ≤120 s auf dem in AP-09 benannten Mac. Gemessene Werte und verwendetes Modell veröffentlichen, keine simulierte Fortschrittsanzeige als Nachweis.

**Lieferung:** Analysemodul, Decoder-/Zeitvertrag, Last-/Cancel-/Speichertest und ein realer anonym dokumentierter Durchlauf.

## AP-04 – Verständlicher Aufnahmeassistent für iPhone und Webcam

**Priorität:** P0. **Owner:** Frontend/CV. **Aufwand:** 3–5 PT. **Abhängigkeit:** AP-02; Qualitätsvertrag mit AP-03.

**Bestehende Einstiegspunkte:** `flow/screens/CameraScreen.tsx`, `camera/CameraZoomControl.tsx`, `camera/zoom.ts`, `flow/bodyChecks.ts`, `pose/nearSide.ts`.

**Neue Module:** `src/capture/framing.ts`, `src/capture/FramingGuide.tsx`.

**Umsetzung:**

1. Vorprüfung über mindestens drei Sekunden mit Bewegung: Hüfte, Knie, Knöchel und Fuß im Bild; Kette derselben Seite; kein bloßes „irgendeine Person erkannt“. Randabstand anfänglich 5 % des Bildes als konfigurierbarer Startwert, in AP-09 überprüfen.
2. Gelenke außerhalb des Bilds, schwache Sichtbarkeit, Verdeckung und schlechte Perspektive getrennt melden. Nur der wichtigste Hinweis wird angezeigt. Hinweiswechsel frühestens nach zwei Sekunden stabiler Evidenz; dieses Timing als UX-Startwert testen.
3. Große, aus der Radposition lesbare Texte und Bildbeispiele. „Kamera weiter weg“ statt „Visibility < 0,75“. Keine Zentimeter-Distanz behaupten, die die App nicht gemessen hat.
4. Echten Kamera-Zoom nach verfügbaren Capabilities anzeigen; niemals CSS-Verkleinerung als mehr erfassten Bildinhalt ausgeben. Bei fehlendem Zoom macOS-Schrittfolge mit Illustration, daneben sofortiger Wechsel zum nativen Handyvideo. „Folgemodus / Center Stage“ und automatische Ausschnittsänderungen erklären.
5. 0,5×, aktive automatische Zentrierung und veränderte Kameraausrichtung dürfen keine alte Geometrie behalten. Die Prüfung arbeitet mit Originalpixeln, nicht mit Seitenzoom des Browsers. Ein schiefes/weitwinkliges Bild kann für manche Werte abgelehnt werden, obwohl eine Person erkannt wird.
6. Fehlt nur ein Oberkörpergelenk, kann ein Knie-Clip aufgenommen werden. Bei unklarer Live-Pose den Clip mit sichtbarem Warnhinweis trotzdem aufnehmen lassen; die Offline-Analyse entscheidet über Messbarkeit. Keine endlose Vorab-Sperre.

**Abnahme:**

- Enge, abgeschnittene Ausgangsposition aus dem Selbsttest wird mit einem umsetzbaren Hinweis abgefangen. Einsteiger finden den weiteren Bildausschnitt oder den Dateiweg ohne Entwicklerhilfe.
- Teilverdeckung während einer Pedalumdrehung lässt die Hinweise nicht flackern. Bekleidung und Hautfarbe des Fahrers sind kein Bedienparameter.
- Nicht steuerbare Continuity-Kamera zeigt keinen vermeintlich funktionsfähigen 0,5×-Schalter. Kameras mit Zoom melden nach Änderung den real übernommenen Wert.
- Abnahme mit den ersten fünf Einsteigern aus AP-09; mindestens vier schaffen eine brauchbare Aufnahme innerhalb von zwei Einrichtungsversuchen. Das ersetzt nicht die spätere Gesamtabnahme.

**Lieferung:** Aufnahmeassistent, Kamera-Hilfebilder, Framing-Reason-Codes und Auswertung der fünf Versuche.

## AP-05 – Kniebewegung ohne Pflichtmarker als überprüfbare Methode

**Priorität:** P0. **Owner:** CV/Messlogik plus fachlicher Reviewer. **Aufwand:** 7–12 PT. **Abhängigkeit:** AP-03 und annotierte Daten aus AP-09.

**Bestehende Einstiegspunkte:** `metrics/angles.ts`, `metrics/stats.ts`, `metrics/cycles.ts`, `metrics/bdc.ts`, `pose/measureSideLock.ts`, `types/metrics.ts`, `rules/catalog.ts`.

**Neue Module:** `src/analysis/motionCycles.ts`, `src/analysis/kneeObservation.ts`; Ergebnisvertrag B.

**Umsetzung:**

1. Bildraum-Winkel für Hüfte–Knie–Knöchel einer festen, über den Abschnitt verfolgten Seite berechnen. Anatomische L/R-Verwechslung, Kettenwechsel, unrealistische Sprünge und verdeckte Gelenke explizit als Datenlücken behandeln. Untere Sichtbarkeitsschwelle nicht pauschal senken, um das Gate zu passieren.
2. Markerfreie Bewegungssegmentierung als eigenes Modul: Knöchelbewegung relativ zur Hüfte und Periodizität verwenden; Start-/Endteilzyklen, stehende Beine und seitliche Körperbewegung ablehnen. Unterstützten Frequenzbereich und Plausibilitätskriterien in der Version konfigurieren und mit AP-09 bestimmen. Ohne belastbare Periodizität kein Mehrzykluswert.
3. Prüfbare erste Auswertungsvariante festlegen: pro vollständigem gültigem Zyklus das 10. Perzentil der validen Roh-Kniebeugungen als robuste Beobachtung nahe größter Streckung, anschließend Median über Zyklen. Methode `max_extension`, Version z. B. `max_extension.p10.v1`; UI: „Kniebeugung nahe größter Streckung“. Das ist kein exaktes Einzelbildminimum. Alternative Variante nur mit neuem Versionsnamen und Vergleich auf demselben Datensatz.
4. Mindestumfang für den Einsteigerwert zunächst zehn vollständig verwendbare Zyklen im ausgewählten Abschnitt; ausreichende zeitliche Abdeckung um Streckung nachweisen. Bestehende Experten-Mindestwerte nicht unbemerkt verändern. Wenn Material nicht reicht: konkreter Grund und Wiederholung statt erfundener Zyklen.
5. Eine geglättete Reihe darf die Bewegungssuche unterstützen; die numerische Beobachtung basiert auf den validen Rohwinkeln. Lange Verdeckungen werden nicht interpoliert. Datenlücken in der Nähe der relevanten Streckphase schließen den betreffenden Zyklus aus.
6. Neue Methode durch Ergebnisparser, Export und Regelzuordnung führen. Vorhandene BDC-Zielprofile dürfen nicht greifen. Für `motion_estimate` keine als BDC bezeichneten Phasenbilder erzeugen; Belege als Bewegungszustand mit Zeitstempel benennen.
7. BSG/Skala/Pedalmarker sind für diese Kniemetrik optional. Andere Metriken erhalten eigene Gates statt des gemeinsamen Alles-oder-nichts-Gates. Erst nach gesonderter Freigabe passende Regeln für `max_extension` hinterlegen.

**Abnahme:**

- Weißes Indoor-Bike ohne Marker liefert bei geeigneter Realaufnahme eine Kniebeobachtung; weder B/S/G noch Radgröße werden abgefragt.
- Halbzyklen, fehlender Knöchel, Wechsel der Körperseite und bloßes Wippen liefern keinen scheinbar gültigen Zehnzyklenwert.
- Ein Clip mit derselben Pose-/Zeitreihe ist reproduzierbar. BDC und `max_extension.p10.v1` bleiben in Export und Vergleich unterscheidbar; ein BDC-Regelprofil lehnt die neue Methode ab.
- Belegbild zeigt dieselbe Seite und einen tatsächlichen Frame aus einem verwendeten Zyklus. Datenwert stammt aus dem beschriebenen Aggregat, nicht aus der grafisch geglätteten Darstellung.
- Genauigkeits-/Wiederholbarkeitskriterien AP-09 bestanden und von fachlichem Reviewer gegengezeichnet. Bei Nichtbestehen keine Umbenennung von „experimentell“ in „validiert“.

**Lieferung:** versionierte markerfreie Methode, reproduzierbarer Benchmarkreport, Beispielbericht ohne Einstell-Ampel, dokumentierte Ausschlussfälle.

## AP-06 – Drei-Schritte-Ablauf, Ergebnisse und Wiederholung

**Priorität:** P0. **Owner:** Frontend/Produkt. **Aufwand:** 3–5 PT. **Abhängigkeit:** AP-02/AP-03-Verträge, Integration mit AP-05.

**Bestehende Einstiegspunkte:** `flow/FlowProvider.tsx`, `flow/constants.ts`, `flow/components/FlowPrimary.tsx`, `flow/screens/ResultScreen.tsx`, `flow/exportResult.ts`, `sessions/import.ts`, `sessions/compare.ts`, `types/result.ts`.

**Umsetzung:**

1. Einsteigermodus mit den drei Nutzerphasen aus dem Maßnahmenplan; Detailzustände bleiben intern. Alten kalibrierten Ablauf unter „Erweiterte Messung“ weiter anbieten. „Diagnose“ ist auf keinem Erfolgs- oder üblichen Fehlerweg erforderlich.
2. Clip nach Aufnahme automatisch lokal analysieren; deutlich zwischen Aufnahme fertig und Analyse fertig unterscheiden. Bei Analysefehler „Gespeichertes Video erneut auswerten“ als Hauptaktion.
3. Ergebnisse aus unveränderlichem Beobachtungsbericht anzeigen: Kernmetrik Knie, verwendetes Zeitfenster, Anzahl nutzbarer Zyklen, repräsentatives Bild. Bis zu zwei zusätzliche verfügbare Werte; fehlende Werte verständlich erläutern.
4. `usable` setzt die Kernmetrik voraus. `partial` benennt vorhandene und fehlende Metriken. `retake` zeigt einen Hauptgrund, einen Beleg und eine konkrete nächste Aufnahmehandlung. Eine plausible KI-Erklärung allein kann den Status nicht hochsetzen.
5. Textvorlagen für lokale Erklärungen und Wiederholungsgründe liefern. Keine Abhängigkeit von AP-07 für den Hauptablauf. Einstellhinweise nur bei passendem freigegebenem Regelprofil; sonst beobachtete Unterschiede und Grenzen erklären.
6. Vergleich nur methodenkompatibler Resultate. Lokale Speicherung beider Ergebnisversionen, verständliche Löschfunktion für Clip und Ergebnis separat, geprüfter JSON-/Markdown-Export. Speicher- und Datenschutzhinweis darf keine automatische Cloud-Nutzung implizieren.

**Abnahme:**

- Neuer Nutzer erreicht vom Start aus eine gespeicherte Aufnahme und lokale Auswertung ohne B/S/G-, Seed- oder Diagnosebegriff.
- Offline ist derselbe Hauptablauf benutzbar; API-Timeout ist für eine lokale Auswertung ohne Wirkung.
- Bestehende v1-Dateien und neue Beobachtungsberichte importieren/exportieren korrekt. Öffnen einer anderen Session verändert einen alten Bericht nicht.
- „Erneut auswerten“ greift auf dieselbe Aufnahme zu; „Neu aufnehmen“ erzeugt bewusst ein anderes Asset.
- Gesamtabnahme aus AP-09 wird auf diesem UI durchgeführt, nicht auf dem Labormodul.

**Lieferung:** neuer Standardflow, lokale Erklärungsvorlagen, Ergebnisformat-Integration und unmoderierter Testablauf.

## AP-07 – Optionale KI-Erklärung mit GPT-5.6 Luna

**Priorität:** P1, kein Blocker des lokalen Piloten. **Owner:** Backend/AI plus Frontend. **Aufwand:** 4–7 PT. **Abhängigkeit:** AP-06 und reale Belege/Referenzantworten aus AP-09.

**Geplante Module:** **neu** `src/coach/evidence.ts`, `src/coach/schema.ts`, `src/coach/CoachPanel.tsx`, `server/coach/route.ts`, `server/coach/provider.ts`, `evals/coach/`.

**Modellentscheidung:** `gpt-5.6-luna` zunächst evaluieren. Es verarbeitet Bilder und Text, keine direkte Videoeingabe. API-Verfügbarkeit im Betreiberprojekt vor Implementierungsabnahme prüfen; Modell-ID, Promptversion und Schemaversion im Resultat speichern. [Offizielle Modellseite](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

**Auftrag und Schnittstelle:**

1. Eine explizite Aktion „KI-Erklärung ergänzen“ zeigt Bildvorschau und Datenumfang. Der lokale Bericht ist vorher schon verfügbar. Kein automatischer Aufruf bei Kamerastart und keine Übertragung existierender Nutzervideos durch die Entwicklung.
2. Request an einen serverseitigen Endpunkt `POST /api/coach`: `requestId`, `analysisId`, `analysisHash`, `locale: 'de'`, gültige Metrikreferenzen, freigegebene Regel-IDs und maximal zwölf Belegbilder mit `frameId`/`mediaTimeMs`/Bildabmessungen. Jeder Bildzeitpunkt ausdrücklich im Text beschriftet. Keine Rohvideo-URL und kein beliebiger vom Modell zu ladender Link.
3. Bilder lokal auswählen, Metadaten entfernen und zunächst auf maximal 1024 Pixel lange Kante begrenzen; Gesamtgrenze 8 MiB dekodierte Bilder und 12 MiB HTTP-Body. Zuschneiden darf erforderliche Gelenke nicht entfernen. Diese Limits sind eigene Produktgrenzen, keine Behauptung der Anbieterlimits.
4. Responses API mit Bildeingaben, `store: false` und strukturiertem Ausgabeschema. Kein Browser-API-Key. Betreiberseitige Authentifizierung, Rate Limit, Idempotenz und begrenzte Bild-/Tokenmengen; keine Modelleigenmächtigkeit für Dateien oder andere Tools erforderlich.
5. Ausgabe enthält nur `summary`, `observations[{code, frameIds, metricIds, explanation}]`, `nextActionCode` und `limitations`. Zulässige nächste Aktionen z. B. `keep_record`, `retake_wider`, `retake_more_light`, `retake_side_on`, `review_with_fitter`. Konkrete Einstellmaßnahmen nur als bereits freigegebene Regel-ID, nicht als frei erfundene Millimeterempfehlung.
6. Server prüft Schema, existierende Belege, Metrikverfügbarkeit und Regelzuordnung. Zahlen und Einstelltext aus dem lokalen Bericht bzw. erlaubten Vorlagen einsetzen. Widersprüche, unbekannte Referenzen, Refusal oder unvollständige Antworten führen zum lokalen Erklärungstext. Das LLM erhält keine Schreibberechtigung auf Metriken oder Kalibrierung.
7. 20-s-Timeout, höchstens ein kontrollierter Retry bei vorübergehendem Fehler. Doppelklick derselben `requestId` darf keine parallelen Anbieteraufrufe auslösen. Zielkosten ≤0,10 US-Dollar pro Erklärung, harte Betreibergrenze zunächst 0,25 US-Dollar inklusive Retry; Schätzung vor Aufruf anhand aktuell verifizierter Modellpreise und tatsächlichen Limits, Abrechnung nach zurückgemeldeter Nutzung. Das sind Budgetziele, keine zugesagten API-Kosten.
8. Projekt-Datenhaltung dokumentieren: keine dauerhafte Bildablage im eigenen Dienst, keine Bild-/Promptinhalte in Standardlogs, begrenzte Request-Metadaten. Anbieterretention und Löschmöglichkeiten korrekt beschreiben; `store: false` bedeutet nicht pauschal Zero Data Retention. [Datenkontrollen](https://developers.openai.com/api/docs/guides/your-data).

**Abnahme:**

- Ohne Freigabe verlassen weder Bilder noch Messwerte das Gerät; Ablehnen und API-Ausfall lassen lokale Ergebnisse benutzbar.
- Mindestens 50 Referenzfälle aus echten und absichtlich unbrauchbaren Clips/Ergebniskombinationen: keine erfundene Zahl, keine Referenz auf nicht gesendete Bilder, kein Freigeben fehlender Kniemessung. Fälle mit scheinbaren Anweisungen im Bild/Metadaten werden als Szeneninhalt behandelt.
- Jede Beobachtung ist an reale Belege gebunden. Fehlende Ferse darf nicht zum Erfinden eines Kniewinkels führen; fehlende Pose darf nicht durch Selbstsicherheit des Modells ersetzt werden.
- Verblindeter Vergleich gegen lokale Textvorlagen mit zehn Testern: mindestens acht bevorzugen die KI-Erklärung als verständlicher oder hilfreicher. Sonst AP-07 als Experiment belassen; der bloße API-Erfolg rechtfertigt die Cloud-Komponente nicht.
- Latenz, tatsächliche Tokenkosten, Fehlerrate und fachliche Fehler werden berichtet. Größeres Vergleichsmodell nur auf identischen Fällen und mit vorher dokumentiertem Budget evaluieren.

**Lieferung:** geprüfter Dienst hinter Feature-Flag, zustimmungsbasierter UI-Anhang, Evalreport mit Versionsangaben und Betreiberkonfiguration. Deployment und Freigabe sind eine spätere Lieferung, nicht Bestandteil dieses Plan-Pushs.

## AP-08 – Allgemeine Fahrradreferenzen statt Farbprototyp

**Priorität:** P1/Forschung, unabhängig vom Basispilot. **Owner:** Computer Vision. **Aufwand:** zuerst auf 2 PT begrenzte Machbarkeit; nach Review grob 5–10 PT, Trainings-/Annotationsbedarf gegebenenfalls neu schätzen. **Abhängigkeit:** AP-03 und AP-09.

**Bestehende Einstiegspunkte:** `calibration/detect.ts`, `calibration/detect.worker.ts`, `calibration/detectEngine.ts`, `calibration/propose.ts`, `types/calibration.ts`.

**Umsetzung:**

1. Machbarkeit an echten weißen/schwarzen Fahrrädern und Indoor-Bikes prüfen. Fahrradregion, Rahmen, Tretlager, Sattel und tatsächlicher Handkontakt jeweils separat annotieren und bewerten.
2. Drei Ansätze auf denselben Frames vergleichen: aktueller Prototyp als Baseline, geeigneter lokaler Objekt-/Keypoint-Ansatz, optional Vision-Modell für grobe Kandidaten. Ein „bicycle“-Rechteck zählt nicht als erfolgreicher B/S/G-Detektor.
3. Sichtbare Referenzen aus mehreren Frames zusammenführen. Kein allgemeines Dreieck als Tretlager-/Sattelreferenz voraussetzen. Hände/Fahrer und stationäre Antriebseinheiten als reguläre Verdeckungsfälle behandeln.
4. Für jeden Punkt Herkunft, Bild-ID, Unsicherheit und Bestätigung führen. Grobe GPT-Koordinaten dürfen ohne Geometrieprüfung/Benchmark kein bestätigter Messpunkt werden. Unbekannt bleibt unbekannt.
5. Falls Korrektur erforderlich: ein Standbild, ein Punkt pro Schritt, Lupe und verständliche Bezeichnung. Dies geschieht nach der Aufnahme und blockiert den markerfreien Kniebericht nicht.
6. Bei übernommenem Fremdcode vor dem Merge Lizenz, Modellgewichte-Lizenz und Herkunft prüfen; keine unbestätigte Genauigkeitsbehauptung aus fremden Projektbeschreibungen übernehmen.

**Abnahme:**

- Report enthält pro Punkt Sichtbarkeitsfälle, normalisierten Lokalisierungsfehler und Rate fälschlich als sicher erkannter verdeckter Punkte. Keine reine Objektklassifikationsquote.
- Auf dem festgelegten Negativsatz keine als bestätigt ausgegebenen unsichtbaren Referenzen. Sichtbare Kandidaten werden unabhängig nachannotiert; Ziel medianer Punktfehler ≤1 % der Bilddiagonale als Forschungs-Gate, vor einer Messverwendung verschärfen bzw. fachlich überprüfen.
- Fehlender Kandidat oder unklare Rahmenerkennung lässt den Basispilot bedienbar. Ein weißes Indoor-Bike wird nicht wegen fehlender Goldpixel als „kein Fahrrad“ im Hauptablauf abgewiesen.

**Lieferung:** Machbarkeitsentscheidung nach 2 PT. Nur bei nachgewiesenem Nutzen danach Detektor-PR; andernfalls ehrlich dokumentierte Grenze und optionaler Korrekturpfad.

## AP-09 – Realvideo-Benchmark und Abnahme mit Einsteigern

**Priorität:** P0, ab Tag 1. **Owner:** QA/Produkt plus unabhängiger fachlicher Reviewer. **Aufwand:** 5–8 PT für Infrastruktur/Auswertung; Rekrutierung, Annotation und Begutachtung abhängig von Verfügbarkeit separat planen.

**Neue Artefakte:** `evals/bikefit/manifest.schema.json`, Evaluationsrunner, `docs/validation/`, CI-Workflow für lizenzierte/synthetische Regressionen. Reale private Clips in einem zugriffsgeschützten Datensatz, nicht im öffentlichen Repository.

**Datensatz:**

- Mindestens 30 brauchbare Realclips von mindestens zehn verschiedenen Fahrern; verschiedene Bekleidung, Körperproportionen, Beleuchtung und Radtypen einschließlich Indoor-Bike. Wiederholte Clips desselben unveränderten Setups für Wiederholbarkeit vorsehen.
- Zusätzlich mindestens zwölf absichtlich problematische Clips: Fuß abgeschnitten, Knie verdeckt, Front-/Schrägansicht, starke Weitwinkelrandlage, Kamerabewegung, automatische Zentrierung, mehrere Personen, Codecproblem und Stillstand. Nicht alle Fehler müssen als Posefehler erkennbar sein; ihr jeweiliger Produktweg wird geprüft.
- Die gleiche Person darf nicht gleichzeitig zur Optimierung der Schwellen und zur behaupteten unabhängigen Endabnahme dienen. Einen getrennten Holdout nach Fahrern führen; Parametersuche und finales Testset dokumentieren.
- Für die Winkelprüfung mindestens drei vollständige Zyklen je brauchbarem Clip systematisch annotieren; Abtastung und Referenzaggregation passend zu `max_extension.p10.v1`. Mindestens 20 % der Annotationen durch zweite Person kontrollieren, Differenzen und Ausschlüsse berichten.
- Quelle, Nutzungsrecht, Aufnahmebedingungen, Linsenangabe mit Herkunft, Dateihash und Referenzversion dokumentieren. Nur mit geeigneter Freigabe Material weitergeben. Keine Aufzeichnung aus dem begleiteten Selbsttest automatisch als verfügbares Trainingsmaterial behandeln.

**Vorgeschlagene technische Freigabeziele – vor der Auswertung festschreiben:**

| Kriterium | Ziel / Nachweis |
| --- | --- |
| Kniebeugung gegen unabhängige 2D-Annotation nach derselben Methode | Median absoluter Fehler ≤3°, p95 ≤7°, mittlerer vorzeichenbehafteter Fehler innerhalb ±2° |
| Wiederholung bei unverändertem Setup | Median der absoluten Ergebnisdifferenzen ≤3°; Verteilung und Ausreißer berichten |
| Ungültige Kernmetrik | Kein `usable`-Kniebericht auf den definierten vollständig verdeckten/abgeschnittenen Negativfällen |
| Methodenidentität | Kein `max_extension`-Wert als BDC und keine Übernahme fremder Zielbänder |
| End-to-End ohne Hilfe | ≥8/10 Anfänger innerhalb von 5 min zu brauchbarem Kniebericht; ≥9/10 nach höchstens einer angeleiteten Wiederholung |
| Wiederanlauf | Analyse erneut starten ohne neue Aufnahme; gleiche Eingabe-/Ergebnisprovenienz |
| Zielhardware | Mac-Modell, RAM, Browser, iPhone/iOS, Codec, Linse und lokale Analysezeiten im Report |
| Cloud optional | Offline-/Opt-out-Lauf erfolgreich; KI-Fehler verändert keine Metrik |

Diese Zahlen sind vorgeschlagene Engineering-Gates für einen beobachtenden Pilot. Sie sind keine klinische Validierung und kein aus Literatur übernommenes individuelles Zielband. Der fachliche Reviewer bestätigt vor dem Test, ob sie für die geplanten Aussagen ausreichen; Änderungen danach erfordern erneute Auswertung mit offengelegter Begründung.

**Testablauf je Einsteiger:**

1. Frischer Start, nur die App-Anleitung. Person richtet die Kamera ein und nimmt auf; Moderator beobachtet ohne Hilfe.
2. Zeit bis zum ersten gespeicherten Clip, zum Kniebericht, Anzahl Rückwege, unklare Begriffe, benötigte Hilfe und Abbruchgrund erfassen. Erfolgreiche Fehlererkennung getrennt von erfolgreicher Messung zählen.
3. Nutzer erklärt in eigenen Worten, was gemessen wurde und was die nächste Handlung ist. „Eine Zahl erschienen“ genügt nicht als Verständnisnachweis.
4. Ein gezielter Fehler-/Wiederholungsfall und ein Vergleich mit zweitem Clip. Kein künstlicher Positivfall im Haupttest.
5. End-to-End-Erfolg und fachliche Genauigkeit getrennt ausweisen; erst bei beiden erfüllten Gates Pilotfreigabe empfehlen.

**Lieferung:** Rechte-/Datensatzmanifest ohne private Medien im Git, reproduzierbarer Benchmark, Testprotokolle, offene Befunde nach Schwere und begründete Go/No-Go-Entscheidung. Kein „ready to roll“ allein aufgrund grüner Unit-Tests.

## PR-Reihenfolge und Übergabeformat

1. AP-00 übernehmen; AP-01 als erste Korrekturlieferung. AP-02/AP-03 legen gemeinsame Typen fest; AP-09 startet Rekrutierung und Referenzdaten.
2. AP-02 und AP-03 mit einem realen gespeicherten Clip integrieren. AP-04 auf diesem Aufnahmeweg entwickeln.
3. AP-05 und AP-06 zur lokalen Gesamtauswertung verbinden; AP-09 entscheidet über die Pilotfreigabe.
4. AP-07 separat evaluieren; AP-08 separat nach Machbarkeitsentscheidung fortsetzen.

Jeder PR nennt Paket-ID, tatsächlichen Lieferumfang, noch offene Kriterien, reproduzierbare Testschritte und relevante Messwerte. Für Video-/KI-Pakete außerdem Eingabehash, Konfiguration und Methoden-/Modellversionen angeben. Bestehende private Reviews und Nutzeraufnahmen nicht pauschal mitstagen.

Die Entwickler können diese Paketabschnitte direkt als Tickets übernehmen. Die Beauftragung lautet zunächst **Lieferung A und lokaler Pilot B**, mit AP-07 als optionaler, messbar nützlicher Ergänzung. Vollautomatische Rahmengeometrie und Cloud-KI sind keine Voraussetzung dafür, dass ein Anfänger überhaupt einen Clip aufzeichnen und eine ehrliche Kniebeobachtung erhalten kann.
