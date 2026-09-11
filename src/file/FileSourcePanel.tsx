import { useRef } from 'react'
import type { LocalFileMeta } from '../types/file.ts'
import { FILE_ACCEPT } from './classify.ts'

export type FileSourcePanelProps = {
  file: LocalFileMeta | null
  error: string | null
  onPick: (file: File) => void
}

export function FileSourcePanel({ file, error, onPick }: FileSourcePanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <section className="module-slot" data-module="file-source" data-upload="false">
      <header>
        <p className="kicker">Datei · lokal</p>
        <h2>{file ? file.name : 'Lokale Datei öffnen'}</h2>
      </header>
      <p>
        Video oder Einzelbild von diesem Gerät. Standard ist kein Upload — die Datei bleibt im Browser.
      </p>
      {file && (
        <p className="ok-note" data-file-kind={file.kind}>
          {file.kind === 'image'
            ? `Bild ${file.width}×${file.height} · statische Prüfung`
            : `Video${file.width > 0 ? ` ${file.width}×${file.height}` : ''}${
                file.durationMs ? ` · ${(file.durationMs / 1000).toFixed(1)}s` : ''
              }`}
        </p>
      )}
      {error && (
        <p className="lost-banner" data-file-error>
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
        hidden
        onChange={(event) => {
          const next = event.target.files?.[0]
          event.target.value = ''
          if (next) onPick(next)
        }}
      />
      <div className="btn-row">
        <button type="button" onClick={() => inputRef.current?.click()}>
          Datei wählen
        </button>
      </div>
    </section>
  )
}
