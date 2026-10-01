import { useState } from 'react'
import Header from './components/Header'
import AnalysisInput from './components/AnalysisInput'
import ResultsPanel from './components/ResultsPanel'
import useBackendConnection from './hooks/useBackendConnection'
import useImageAnalysis from './hooks/useImageAnalysis'
import useVideoAnalysis from './hooks/useVideoAnalysis'

/**
 * App entry. The layout is intentionally simple: a fixed header, then a primary
 * dashboard with the bounded input panel on the left/top and the compact result
 * panel on the right/below. Switching source mode clears the other mode's
 * selection so the DOM tree stays lean and no hidden huge panel remains.
 */
export default function App() {
  const [mode, setMode] = useState('image')
  const { connectionState, health, connectionReady, connectionMessage } = useBackendConnection()
  const image = useImageAnalysis()
  const video = useVideoAnalysis()

  const handleModeChange = (next) => {
    if (next === mode) return
    setMode(next)
    // Clear the opposite mode to avoid cross-mode state bleeding.
    if (next === 'image') {
      video.clear()
    } else {
      image.clear()
    }
  }

  return (
    <div className="app">
      <Header connectionState={connectionState} health={health} />

      <main className="shell">
        <section className="hero">
          <p className="hero__eyebrow">Computer Vision · Fire Intelligence</p>
          <h1 className="hero__title">Analyze. Identify. Respond.</h1>
          <p className="hero__lede">
            AI-powered flame detection, segmentation, colour analysis and material identification.
          </p>
        </section>

        <div className="workspace">
          <div className="workspace__col workspace__col--input">
            <AnalysisInput
              mode={mode}
              onModeChange={handleModeChange}
              image={image}
              video={video}
              connectionReady={connectionReady}
              connectionMessage={connectionMessage}
            />
          </div>

          <div className="workspace__col workspace__col--results">
            <ResultsPanel mode={mode} image={image} video={video} />
          </div>
        </div>
      </main>
    </div>
  )
}
