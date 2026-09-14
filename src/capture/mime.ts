export type RecorderMime = {
  mimeType: string
  extension: 'webm' | 'mp4'
  codec: string
}

export const RECORDER_MIME_CANDIDATES: readonly RecorderMime[] = [
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm', codec: 'vp9' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm', codec: 'vp8' },
  { mimeType: 'video/webm', extension: 'webm', codec: 'webm' },
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', codec: 'avc1' },
  { mimeType: 'video/mp4', extension: 'mp4', codec: 'mp4' },
]

export function pickRecorderMime(
  isTypeSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
): RecorderMime | null {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate.mimeType)) return candidate
    } catch {
      /* some test doubles throw */
    }
  }
  return null
}

export function recorderHasAudioTracks(stream: MediaStream): boolean {
  return stream.getAudioTracks().length > 0
}
