import type { BikeMarkId } from '../types/calibration.ts'

export const MARK_ORDER: readonly BikeMarkId[] = ['B', 'S', 'G']

export type MarkGuide = {
  id: BikeMarkId
  letter: BikeMarkId
  name: string
  where: string
  click: string
}

/** German names — never show the letter alone in the product UI. */
export const MARK_GUIDE: Record<BikeMarkId, MarkGuide> = {
  B: {
    id: 'B',
    letter: 'B',
    name: 'Tretlager-Mitte',
    where: 'Mittelpunkt des Tretlagers / der Kurbelachse.',
    click: 'In die Bühne auf die Tretlager-Mitte klicken.',
  },
  S: {
    id: 'S',
    letter: 'S',
    name: 'Satteloberseite',
    where: 'Reproduzierbarer Punkt auf der Satteloberseite (Mitte der Auflage, nicht die Nase).',
    click: 'Auf die Satteloberseite klicken — denselben Punkt später wiederfinden.',
  },
  G: {
    id: 'G',
    letter: 'G',
    name: 'Hand an Bremsgriffen / Hoods',
    where: 'Tatsächlicher Griffkontakt an den Hoods, nicht das Lenkerende.',
    click: 'Dorthin klicken, wo die Hand die Hoods hält.',
  },
}

export function markTitle(id: BikeMarkId): string {
  const m = MARK_GUIDE[id]
  return `${m.letter} = ${m.name}`
}

export function markOverlayLabel(id: BikeMarkId): string {
  if (id === 'B') return 'B Tretlager'
  if (id === 'S') return 'S Sattel'
  return 'G Hoods'
}

export function nextMark(id: BikeMarkId): BikeMarkId | null {
  if (id === 'B') return 'S'
  if (id === 'S') return 'G'
  return null
}
