import { useCallback, useEffect, useRef, useState } from 'react'
import { ALLOW_SYNTHETIC_FIXTURE } from '../config/defaults.ts'
import type { CameraStatus } from '../types/camera.ts'
import type { LocalFileMeta } from '../types/file.ts'
import { classifyCameraError } from './classifyError.ts'
import { requestVideoOnlyStream, stripAudioTracks } from './constraints.ts'
import { deviceIdFromStream, listVideoDevices } from './devices.ts'
import { createSyntheticStream } from './synthetic.ts'
import { applyFileMetaPatch } from '../file/meta.ts'
import { createStillImageStream, openLocalFile, revokeObjectUrl } from '../file/openLocal.ts'

const IDLE: CameraStatus = {
  permission: 'idle',
  source: 'camera',
  deviceId: null,
  devices: [],
  error: null,
  usingMicrophone: false,
}

export function useCamera(): {
  status: CameraStatus
  stream: MediaStream | null
  file: LocalFileMeta | null
  start: (deviceId?: string) => Promise<void>
  stop: () => void
  startSynthetic: () => void
  startFile: (file: File) => Promise<void>
  patchFile: (patch: Partial<LocalFileMeta>) => void
} {
  const [status, setStatus] = useState<CameraStatus>(IDLE)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [file, setFile] = useState<LocalFileMeta | null>(null)
  const generationRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const disposeSyntheticRef = useRef<(() => void) | null>(null)
  const fileUrlRef = useRef<string | null>(null)
  const devicesRef = useRef(status.devices)

  const releaseStream = useCallback(() => {
    disposeSyntheticRef.current?.()
    disposeSyntheticRef.current = null
    const current = streamRef.current
    if (current) {
      for (const track of current.getTracks()) track.stop()
    }
    streamRef.current = null
    setStream(null)
    revokeObjectUrl(fileUrlRef.current)
    fileUrlRef.current = null
    setFile(null)
  }, [])

  const adoptStream = useCallback(
    (next: MediaStream, nextStatus: CameraStatus) => {
      stripAudioTracks(next)
      streamRef.current = next
      setStream(next)
      setStatus({ ...nextStatus, usingMicrophone: false })
      const track = next.getVideoTracks()[0]
      if (!track) return
      const born = generationRef.current
      track.addEventListener(
        'ended',
        () => {
          if (generationRef.current !== born) return
          if (streamRef.current !== next) return
          releaseStream()
          setStatus((prev) => ({
            ...prev,
            permission: 'stopped',
            error: 'Die Kamera wurde getrennt.',
            usingMicrophone: false,
          }))
        },
        { once: true },
      )
    },
    [releaseStream],
  )

  const start = useCallback(
    async (deviceId?: string) => {
      const born = ++generationRef.current
      releaseStream()
      setStatus((prev) => ({
        ...prev,
        permission: 'prompting',
        source: 'camera',
        error: null,
        usingMicrophone: false,
        ...(deviceId ? { deviceId } : {}),
      }))
      try {
        const media = await requestVideoOnlyStream(deviceId)
        if (generationRef.current !== born) {
          for (const track of media.getTracks()) track.stop()
          return
        }
        const devices = await listVideoDevices()
        if (generationRef.current !== born) {
          for (const track of media.getTracks()) track.stop()
          return
        }
        adoptStream(media, {
          permission: 'granted',
          source: 'camera',
          deviceId: deviceIdFromStream(media, deviceId),
          devices,
          error: null,
          usingMicrophone: false,
        })
      } catch (error) {
        if (generationRef.current !== born) return
        const classified = classifyCameraError(error)
        setStatus((prev) => ({
          ...prev,
          permission: classified.permission,
          source: 'camera',
          error: classified.error,
          usingMicrophone: false,
        }))
      }
    },
    [adoptStream, releaseStream],
  )

  const stop = useCallback(() => {
    generationRef.current += 1
    const hadLiveStream = streamRef.current !== null || fileUrlRef.current !== null
    releaseStream()
    setStatus((prev) => ({
      ...prev,
      permission: hadLiveStream || prev.permission === 'prompting' ? 'stopped' : prev.permission,
      error: null,
      usingMicrophone: false,
    }))
  }, [releaseStream])

  const startSynthetic = useCallback(() => {
    if (!ALLOW_SYNTHETIC_FIXTURE) return
    const born = ++generationRef.current
    releaseStream()
    try {
      const fixture = createSyntheticStream()
      if (generationRef.current !== born) {
        fixture.stop()
        return
      }
      disposeSyntheticRef.current = fixture.stop
      adoptStream(fixture.stream, {
        permission: 'granted',
        source: 'synthetic',
        deviceId: null,
        devices: devicesRef.current,
        error: null,
        usingMicrophone: false,
      })
    } catch (error) {
      if (generationRef.current !== born) return
      const classified = classifyCameraError(error)
      setStatus((prev) => ({
        ...prev,
        permission: classified.permission,
        source: 'synthetic',
        error: classified.error,
        usingMicrophone: false,
      }))
    }
  }, [adoptStream, releaseStream])

  const startFile = useCallback(
    async (input: File) => {
      const born = ++generationRef.current
      releaseStream()
      const opened = openLocalFile(input)
      if (!opened.ok) {
        if (generationRef.current !== born) return
        setStatus((prev) => ({
          ...prev,
          permission: 'error',
          source: 'file',
          deviceId: input.name,
          error: opened.error,
          usingMicrophone: false,
        }))
        return
      }
      fileUrlRef.current = opened.meta.objectUrl
      if (opened.meta.kind === 'image') {
        try {
          const bitmap = await createImageBitmap(input)
          if (generationRef.current !== born) {
            bitmap.close()
            revokeObjectUrl(opened.meta.objectUrl)
            return
          }
          const still = createStillImageStream(bitmap)
          disposeSyntheticRef.current = still.stop
          const meta: LocalFileMeta = {
            ...opened.meta,
            width: bitmap.width,
            height: bitmap.height,
            durationMs: 0,
            staticCheck: true,
          }
          setFile(meta)
          adoptStream(still.stream, {
            permission: 'granted',
            source: 'file',
            deviceId: input.name,
            devices: devicesRef.current,
            error: null,
            usingMicrophone: false,
          })
        } catch {
          if (generationRef.current !== born) return
          revokeObjectUrl(opened.meta.objectUrl)
          fileUrlRef.current = null
          setFile(null)
          setStatus((prev) => ({
            ...prev,
            permission: 'error',
            source: 'file',
            deviceId: input.name,
            error: 'Dieses Bild konnte nicht gelesen werden. PNG oder JPEG wählen — die Datei bleibt lokal.',
            usingMicrophone: false,
          }))
        }
        return
      }
      setFile(opened.meta)
      setStatus({
        permission: 'granted',
        source: 'file',
        deviceId: input.name,
        devices: devicesRef.current,
        error: null,
        usingMicrophone: false,
      })
    },
    [adoptStream, releaseStream],
  )

  const patchFile = useCallback((patch: Partial<LocalFileMeta>) => {
    setFile((prev) => applyFileMetaPatch(prev, patch))
  }, [])

  useEffect(() => {
    devicesRef.current = status.devices
  }, [status.devices])

  useEffect(() => {
    const media = navigator.mediaDevices
    let cancelled = false
    const refresh = () => {
      void listVideoDevices().then((devices) => {
        if (cancelled) return
        setStatus((prev) => ({ ...prev, devices }))
      })
    }
    refresh()
    media?.addEventListener?.('devicechange', refresh)
    return () => {
      cancelled = true
      media?.removeEventListener?.('devicechange', refresh)
    }
  }, [])

  useEffect(() => {
    return () => {
      generationRef.current += 1
      disposeSyntheticRef.current?.()
      disposeSyntheticRef.current = null
      const current = streamRef.current
      if (current) {
        for (const track of current.getTracks()) track.stop()
      }
      streamRef.current = null
      revokeObjectUrl(fileUrlRef.current)
      fileUrlRef.current = null
    }
  }, [])

  return { status, stream, file, start, stop, startSynthetic, startFile, patchFile }
}
