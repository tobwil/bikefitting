import { START_PRIMARY_LABEL, START_SECONDARY_CAPTURES } from '../capture/copy.ts'
import { LOCAL_ORIGIN } from './constants.ts'

export const HELP_TOPIC_IDS = [
  'combo',
  'find-results',
  'lost-connection',
  'permission-denied',
  'camera-busy',
  'iphone-hidden',
] as const

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number]

export type HelpTopic = {
  id: HelpTopicId
  title: string
  body: string
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'combo',
    title: 'Getestete Kombination',
    body: 'Mac mit aktuellem macOS, Google Chrome (nicht Safari, nicht Firefox). iPhone als Continuity-Kamera: entsperrt, neben dem Mac, WLAN und Bluetooth an, dieselbe Apple-ID, Continuity-Kamera am iPhone erlaubt. Die App läuft nur im Chrome-Fenster auf dem Mac — nicht im iPhone-Safari.',
  },
  {
    id: 'find-results',
    title: 'Live-Messung und gespeicherte Ergebnisse',
    body: `Live: auf der Startseite „${START_PRIMARY_LABEL}“. Gespeichert: auf derselben Startseite „${START_SECONDARY_CAPTURES}“. Beides gilt nur unter ${LOCAL_ORIGIN}. Dieselbe Messung unter localhost ist ein anderer Ort und erscheint leer.`,
  },
  {
    id: 'lost-connection',
    title: 'Verbindung verloren',
    body: '„BikeFit starten“ erneut doppelklicken. Läuft BikeFit schon, öffnet sich nur Chrome — es wird kein zweiter Server gestartet. Nach einem Mac-Neustart denselben Starter verwenden, kein Terminal. Die Adresse bleibt http://127.0.0.1:47321, nicht localhost.',
  },
  {
    id: 'permission-denied',
    title: 'Kamera: Berechtigung verweigert',
    body: `In Chrome: Schloss in der Adresszeile → Website-Einstellungen → Kamera → Zulassen. Zusätzlich: Systemeinstellungen → Datenschutz & Sicherheit → Kamera → Google Chrome erlauben. Danach in der App erneut „${START_PRIMARY_LABEL}“.`,
  },
  {
    id: 'camera-busy',
    title: 'Kamera belegt',
    body: 'FaceTime, Photo Booth, Zoom, Teams und andere Kamera-Apps schließen. Das iPhone nicht gleichzeitig in einer zweiten Mac-App als Kamera verwenden. Danach in BikeFit die Kamera neu starten.',
  },
  {
    id: 'iphone-hidden',
    title: 'iPhone nicht sichtbar',
    body: 'iPhone entsperren und neben den Mac legen. In der Mac-Menüleiste unter Video die Kamera „iPhone“ wählen. In Chrome das Gerät in der Kameraliste auswählen, bevor die Messung startet. Center Stage aus, wenn der Ausschnitt von allein springt. Erscheint das iPhone nicht: Bluetooth und WLAN prüfen, Energiesparmodus aus, iPhone kurz neu starten.',
  },
]

export function helpTopic(id: HelpTopicId): HelpTopic {
  const topic = HELP_TOPICS.find((row) => row.id === id)
  if (!topic) throw new Error(`missing help topic ${id}`)
  return topic
}
