/** Image buffer in original capture coordinates (RGBA). No upload. */

export type PixelImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function createPixelImage(width: number, height: number, fill = [0, 0, 0, 255]): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0] ?? 0
    data[i + 1] = fill[1] ?? 0
    data[i + 2] = fill[2] ?? 0
    data[i + 3] = fill[3] ?? 255
  }
  return { width, height, data }
}

export function setPixel(image: PixelImage, x: number, y: number, r: number, g: number, b: number, a = 255) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= image.width || yi >= image.height) return
  const i = (yi * image.width + xi) * 4
  image.data[i] = r
  image.data[i + 1] = g
  image.data[i + 2] = b
  image.data[i + 3] = a
}

export function getPixel(image: PixelImage, x: number, y: number): [number, number, number, number] | null {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= image.width || yi >= image.height) return null
  const i = (yi * image.width + xi) * 4
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!]
}

export function strokeLine(
  image: PixelImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
  width = 4,
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)))
  const r = Math.max(1, Math.round(width / 2))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const cx = x0 + dx * t
    const cy = y0 + dy * t
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy <= r * r) setPixel(image, cx + xx, cy + yy, rgb[0], rgb[1], rgb[2])
      }
    }
  }
}

export function strokeCircle(
  image: PixelImage,
  cx: number,
  cy: number,
  radius: number,
  rgb: [number, number, number],
  width = 6,
) {
  const steps = Math.max(24, Math.ceil(2 * Math.PI * radius))
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2
    const x = cx + Math.cos(a) * radius
    const y = cy + Math.sin(a) * radius
    strokeLine(image, x, y, x, y, rgb, width)
  }
}

export function fillDisk(image: PixelImage, cx: number, cy: number, radius: number, rgb: [number, number, number]) {
  const r = Math.ceil(radius)
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy <= radius * radius) setPixel(image, cx + xx, cy + yy, rgb[0], rgb[1], rgb[2])
    }
  }
}

export function imageFromImageData(data: ImageData): PixelImage {
  return { width: data.width, height: data.height, data: new Uint8ClampedArray(data.data) }
}

export function toImageData(image: PixelImage): ImageData {
  const copy = new Uint8ClampedArray(image.data)
  return new ImageData(copy, image.width, image.height)
}
