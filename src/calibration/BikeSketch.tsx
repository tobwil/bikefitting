import type { BikeMarkId } from '../types/calibration.ts'
import { MARK_GUIDE } from './marks.ts'

/** Side-view trainer sketch: click targets B (BB), S (saddle top), G (hoods). */
export function BikeSketch({ active }: { active: BikeMarkId }) {
  return (
    <figure className="bike-sketch" aria-label="Seitenansicht: Tretlager, Sattel, Hoods">
      <svg viewBox="0 0 220 118" role="img">
        <title>Seitenansicht Trainer — B Tretlager, S Satteloberseite, G Hoods</title>
        <rect width="220" height="118" fill="#16130f" />
        {/* wheels */}
        <circle cx="52" cy="86" r="22" fill="none" stroke="#6a6358" strokeWidth="2" />
        <circle cx="168" cy="86" r="22" fill="none" stroke="#6a6358" strokeWidth="2" />
        {/* chainstay + seatstay + downtube */}
        <path
          d="M52 86 L92 86 L78 42 L92 86 L52 86 M92 86 L148 48 L168 86"
          fill="none"
          stroke="#9a9184"
          strokeWidth="2"
        />
        {/* seat post + saddle */}
        <path d="M78 42 L78 28" stroke="#9a9184" strokeWidth="2" />
        <ellipse cx="74" cy="26" rx="16" ry="4.5" fill="#c4a35a" opacity="0.85" />
        {/* stem + hoods */}
        <path d="M148 48 L168 40 L176 46" fill="none" stroke="#9a9184" strokeWidth="2" />
        <ellipse cx="178" cy="48" rx="7" ry="5" fill="#d47a4a" opacity="0.9" />
        {/* crank */}
        <circle cx="92" cy="86" r="5" fill="#e8e0d4" />
        <line x1="92" y1="86" x2="104" y2="104" stroke="#e8e0d4" strokeWidth="2" />
        {/* marks */}
        <MarkDot id="B" x={92} y={86} active={active} />
        <MarkDot id="S" x={74} y={26} active={active} />
        <MarkDot id="G" x={178} y={48} active={active} />
        <text x="14" y="14" fill="#9a9184" fontSize="8" fontFamily="IBM Plex Mono, monospace">
          Seitenansicht · ohne Fahrer
        </text>
      </svg>
      <figcaption>
        {MARK_GUIDE[active].letter} = {MARK_GUIDE[active].name}
      </figcaption>
    </figure>
  )
}

function MarkDot({
  id,
  x,
  y,
  active,
}: {
  id: BikeMarkId
  x: number
  y: number
  active: BikeMarkId
}) {
  const on = id === active
  return (
    <g>
      <circle cx={x} cy={y} r={on ? 7 : 5} fill={on ? '#c4a35a' : '#3a342c'} stroke="#e8e0d4" strokeWidth="1.2" />
      <text
        x={x + 9}
        y={y - 7}
        fill={on ? '#c4a35a' : '#e8e0d4'}
        fontSize="9"
        fontFamily="Barlow Condensed, sans-serif"
        fontWeight="700"
      >
        {id}
      </text>
    </g>
  )
}
