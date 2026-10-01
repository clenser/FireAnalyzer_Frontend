import { Palette } from 'lucide-react'
import { Card, CardHeader, Swatch } from './ui'

/**
 * The single colour measurement a user needs: the mean colour of the flame.
 *
 * The backend also returns six clustering algorithms (VB-GMM, GMM, K-Means++,
 * DBSCAN, Mean-Shift, Agglomerative) with their centroids and sample counts.
 * Those stay in the parsed payload for API consumers and are deliberately not
 * rendered here.
 */
export default function FlameColorCard({ color, className = '' }) {
  if (!color) return null

  const { title, rgb, lab, swatch, hasLab } = color

  return (
    <Card className={`result-card color-card ${className}`.trim()}>
      <CardHeader icon={Palette} title={title} meta={rgb ? 'Measured' : null} />

      <div className="color">
        <Swatch css={swatch} label={swatch ? `Colour swatch ${swatch}` : undefined} />
        <div className="color__values">
          <div className="color__value">
            <span className="color__key">RGB</span>
            <span className="color__rgb is-mono">{rgb ?? '--'}</span>
          </div>
          {hasLab || lab ? (
            <div className="color__value">
              <span className="color__key">LAB</span>
              <span className="color__lab is-mono">{lab ?? '--'}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
