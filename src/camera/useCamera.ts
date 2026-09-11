import { useCallback, useEffect, useRef, useState } from 'react'
import { ALLOW_SYNTHETIC_FIXTURE } from '../config/defaults.ts'
import type { CameraStatus } from '../types/camera.ts'
import { classifyCameraError } from './classifyError.ts'
import { requestVideoOnlyStream, stripAudioTracks } from './constraints.ts'
import { deviceIdFromStream, listVideoDevices } from './devices.ts'
import { createSyntheticStream } from './synthetic.ts'

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
  start: (deviceId?: string) => Promise<void>
  stop: () => void
  startSynthetic: () => void
} {
  const [status, setStatus] = useState<CameraStatus>(IDLE)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const generationRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const disposeSyntheticRef = useRef<(() => void) | null>(null)
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
            error: 'The camera disconnected.',
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
    const hadLiveStream = streamRef.current !== null
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
    }
  }, [])

  return { status, stream, start, stop, startSynthetic }
}
