import { BarChart3, ShieldCheck } from 'lucide-react'
import ImageAnalysisResult from './ImageAnalysisResult'
import VideoAnalysisResult from './VideoAnalysisResult'
import ErrorNotice from './ErrorNotice'
import { ImageProcessingState, VideoProcessingState } from './ProcessingState'

const STEPS = [
  ['1', 'Upload', 'a flame image, or a video to sample'],
  ['2', 'Analyze', 'detection, colour and material matching'],
  ['3', 'Read', 'the verdict, material and suitable agents'],
]

function EmptyState({ mode }) {
  return (
    <div className="results-empty">
      <span className="results-empty__icon" aria-hidden="true">
        <BarChart3 size={20} strokeWidth={1.5} />
      </span>
      <h2 className="results-empty__title">Results appear here</h2>
      <p className="results-empty__desc">
        {mode === 'video'
          ? 'Choose a video, then start the analysis.'
          : 'Choose a flame image and start the analysis.'}
      </p>
      <ol className="results-empty__steps">
        {STEPS.map(([index, title, desc]) => (
          <li className="results-empty__step" key={index}>
            <span className="results-empty__num is-mono" aria-hidden="true">
              {index}
            </span>
            <span>
              <strong>{title}</strong> {desc}
            </span>
          </li>
        ))}
      </ol>
      <p className="results-empty__privacy">
        <ShieldCheck size={12} strokeWidth={1.75} aria-hidden="true" />
        The analysis service samples and analyses the file directly; nothing is processed in your browser.
      </p>
    </div>
  )
}

/**
 * Hosts the result area: the workspace heading plus empty, processing, failed or
 * the result dashboard for whichever source type is active. Only one of the two
 * dashboards is ever mounted, so no hidden panel can grow the page.
 */
export default function ResultsPanel({ mode, image, video }) {
  const active = mode === 'video' ? video : image

  return (
    <div className="results">
      <h2 className="results__title">Results</h2>
      <ResultsBody mode={mode} image={image} video={video} active={active} />
    </div>
  )
}

function ResultsBody({ mode, image, video, active }) {
  if (active.isAnalyzing) {
    return mode === 'video' ? (
      <VideoProcessingState startedAt={video.startedAt} currentStage={video.currentStage} />
    ) : (
      <ImageProcessingState startedAt={image.startedAt} />
    )
  }

  if (active.status === 'error' && active.error) {
    return <ErrorNotice error={active.error} onRetry={active.run} />
  }

  if (mode === 'video') {
    if (video.hasResult) {
      return <VideoAnalysisResult data={video.result} durationMs={video.durationMs} />
    }
    return <EmptyState mode="video" />
  }

  if (image.hasResult) {
    return (
      <ImageAnalysisResult
        data={image.data}
        previewUrl={image.previewUrl}
        dimensions={image.dimensions}
        durationMs={image.durationMs}
      />
    )
  }

  return <EmptyState mode="image" />
}
