import { useEffect, useRef } from 'react'
import { Flame, TriangleAlert } from 'lucide-react'
import { Chip } from './ui'

/**
 * The one-time introduction shown when the app opens: what FlameAnalyzer is,
 * what it is being developed for, and an explicit experimental warning.
 *
 * It is a native modal `<dialog>`, so the focus trap, the inert page behind it,
 * Escape-to-close and the focus restore on close all come from the platform
 * rather than from hand-rolled key handling. Nothing here talks to the API - it
 * is static copy, so it can never affect an analysis.
 */
export default function IntroModal({ onDismiss }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    // The page behind a modal dialog stays scrollable in some browsers; the
    // intro is a full-screen interruption, so it locks the scroll while open.
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    if (!dialog.open) dialog.showModal()

    return () => {
      body.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog className="intro" ref={dialogRef} aria-labelledby="intro-title" onClose={onDismiss}>
      <div className="intro__panel">
        <header className="intro__header">
          <span className="intro__mark" aria-hidden="true">
            <Flame size={16} strokeWidth={1.75} />
          </span>
          <h2 className="intro__title" id="intro-title">
            FlameAnalyzer
          </h2>
        </header>

        <div className="intro__body">
          <p className="intro__text">
            FlameAnalyzer is a prototype fire analyzer. It reads an uploaded image or video to detect the flame,
            determine its fire class, and help narrow down a possible source or cause.
          </p>
          <p className="intro__text">
            It is built with experimental capability for detecting fires associated with metal oxides in batteries.
          </p>

          <div className="intro__warning">
            <div className="intro__warning-head">
              <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
              <Chip tone="medium">Experimental / Prototype</Chip>
            </div>
            <p className="intro__warning-text">
              Results are experimental and must not be treated as a definitive fire-cause determination. Use them as a
              starting point for investigation only.
            </p>
          </div>
        </div>

        <footer className="intro__footer">
          <p className="intro__credit">Powered by EnerzyAI</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={onDismiss}>
            Dismiss
          </button>
        </footer>
      </div>
    </dialog>
  )
}