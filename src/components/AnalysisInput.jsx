import { ImageIcon, Video } from 'lucide-react'
import { Card, Toggle } from './ui'
import { FORCE_NEW_ANALYSIS_HELP } from '../config'
import ImageUpload from './ImageUpload'
import VideoUpload from './VideoUpload'
import AnalyzeButton from './AnalyzeButton'

const MODES = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video },
]

/**
 * The bounded source panel.
 *
 * Its height is capped and the body scrolls internally, so the panel keeps a
 * predictable size whatever is selected. Switching mode clears the other mode's
 * selection so stale state can never leak between them.
 */
export default function AnalysisInput({
  mode,
  onModeChange,
  image,
  video,
  connectionReady,
  connectionMessage,
}) {
  const isImage = mode === 'image'

  return (
    <Card className="panel input-panel">
      <header className="panel__header">
        <h2 className="panel__title">Source</h2>
        <div className="segmented" role="tablist" aria-label="Analysis source type">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="segmented__option"
              aria-selected={isImage ? id === 'image' : id === 'video'}
              onClick={() => onModeChange(id)}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="panel__body">
        {isImage ? (
          <ImageUpload
            file={image.file}
            previewUrl={image.previewUrl}
            dimensions={image.dimensions}
            onSelect={image.select}
            onClear={image.clear}
            isAnalyzing={image.isAnalyzing}
            validationError={image.validationError}
          >
            <Toggle
              checked={image.forceNewAnalysis}
              onChange={image.setForceNewAnalysis}
              label="Force New Analysis"
              help={FORCE_NEW_ANALYSIS_HELP}
              disabled={image.isAnalyzing}
            />
            <AnalyzeButton
              onClick={image.run}
              disabled={!image.file || !connectionReady || image.isAnalyzing}
              isBusy={image.isAnalyzing}
              label="Analyze Flame"
              busyLabel="Analyzing…"
            />
          </ImageUpload>
        ) : (
          <VideoUpload
            file={video.file}
            metadata={video.metadata}
            onSelect={video.select}
            onClear={video.clear}
            isBusy={video.isBusy}
            validationError={video.validationError}
          >
            <Toggle
              checked={video.forceNewAnalysis}
              onChange={video.setForceNewAnalysis}
              label="Force New Analysis"
              help={FORCE_NEW_ANALYSIS_HELP}
              disabled={video.isBusy}
            />
            <AnalyzeButton
              onClick={video.run}
              disabled={!video.file || !connectionReady || video.isBusy}
              isBusy={video.isBusy}
              label="Analyze Video"
              busyLabel="Analyzing…"
            />
          </VideoUpload>
        )}
      </div>

      {!connectionReady ? (
        <p className="panel__note" role="status">
          {connectionMessage}
        </p>
      ) : null}
    </Card>
  )
}
