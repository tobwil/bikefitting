/** Corner luma of a frame — rider motion in the centre should not dominate. */
export function cornerLumaSignature(image: ImageData, inset = 8): [number, number, number, number] {
  const { width, height, data } = image
  const sample = (sx: number, sy: number) => {
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)))
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)))
    const size = Math.max(2, Math.min(inset, Math.floor(Math.min(width, height) / 8)))
    let sum = 0
    let n = 0
    for (let y = y0; y < Math.min(height, y0 + size); y += 1) {
      for (let x = x0; x < Math.min(width, x0 + size); x += 1) {
        const i = (y * width + x) * 4
        sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
        n += 1
      }
    }
    return n > 0 ? sum / n : 0
  }
  return [sample(0, 0), sample(width - inset, 0), sample(0, height - inset), sample(width - inset, height - inset)]
}

export function cornerSignaturesDiffer(
  previous: readonly number[],
  next: readonly number[],
  threshold = 18,
): boolean {
  if (previous.length !== 4 || next.length !== 4) return false
  let max = 0
  for (let i = 0; i < 4; i += 1) {
    max = Math.max(max, Math.abs((next[i] ?? 0) - (previous[i] ?? 0)))
  }
  return max >= threshold
}
