/** 0° = TDC (same convention as the pedal module). */
export function syntheticPhase01(timestampMs: number, rpm = 80): number {
  const degPerMs = (rpm / 60) * 360
  const deg = ((timestampMs * degPerMs) / 1000) % 360
  return (((deg % 360) + 360) % 360) / 360
}

export function phase01ToAngleDeg(phase01: number): number {
  return ((phase01 % 1) + 1) % 1 * 360
}

/** Pedal on the crank circle. 0° = top dead centre; +degrees toward +X. */
export function pointOnCrankCircle(
  bottomBracket: { x: number; y: number },
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: bottomBracket.x + radius * Math.sin(rad),
    y: bottomBracket.y - radius * Math.cos(rad),
  }
}
