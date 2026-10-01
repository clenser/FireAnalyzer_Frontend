import { LoaderCircle, ScanLine } from 'lucide-react'

/** The primary call to action, shared by the image and video panels. */
export default function AnalyzeButton({ onClick, disabled, isBusy, label, busyLabel }) {
  return (
    <button type="button" className="btn btn--primary btn--block" onClick={onClick} disabled={disabled}>
      {isBusy ? (
        <>
          <LoaderCircle size={15} strokeWidth={2} aria-hidden="true" className="spin-icon" />
          {busyLabel}
        </>
      ) : (
        <>
          <ScanLine size={16} strokeWidth={2} aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  )
}
