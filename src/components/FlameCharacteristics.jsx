import { Palette } from 'lucide-react'
import { Card, CardHeader, DataRow, PanelNote } from './ui'
import { rgbToCss, formatRgb, formatLab, CLUSTERING_KEYS } from '../services/normalize'
import { formatCount } from '../utils/format'

function Centroids({ centroids, noiseCount }) {
  if (!centroids?.length) return null

  return (
    <ul className="centroids">
      {centroids.map((centroid, index) => {
        const swatch = rgbToCss(centroid.rgb)
        return (
          <li className="centroid" key={centroid.index ?? index}>
            <span
              className="centroid__swatch"
              style={swatch ? { background: swatch } : undefined}
              aria-hidden="true"
            />
            <span className="centroid__rgb is-mono">{formatRgb(centroid.rgb) ?? '--'}</span>
            {centroid.size !== null ? (
              <span className="centroid__size is-mono">
                {formatCount(centroid.size)} px
                {centroid.weight !== null
                  ? ` · ${(centroid.weight * 100).toFixed(1)}%`
                  : ''}
              </span>
            ) : null}
          </li>
        )
      })}
      {noiseCount ? (
        <li className="centroid centroid--noise">
          <span className="centroid__swatch centroid__swatch--noise" aria-hidden="true" />
          <span className="centroid__rgb is-mono">Noise (unassigned)</span>
          <span className="centroid__size is-mono">{formatCount(noiseCount)} px</span>
        </li>
      ) : null}
    </ul>
  )
}

function ColorRow({ label, cluster }) {
  if (!cluster) return null
  const swatch = rgbToCss(cluster.rgb)

  return (
    <div className="colorrow">
      <div className="colorrow__head">
        <span className="colorrow__label">{label}</span>
        {cluster.clusterCount !== null ? (
          <span className="colorrow__method is-mono">k = {cluster.clusterCount}</span>
        ) : null}
      </div>

      <div className="colorrow__body">
        <span
          className="swatch"
          style={swatch ? { background: swatch } : undefined}
          aria-hidden={swatch ? 'true' : undefined}
        >
          {swatch ? null : 'n/a'}
        </span>

        <div className="colorrow__values">
          <DataRow label="RGB" value={formatRgb(cluster.rgb)} mono />
          <DataRow label="LAB" value={formatLab(cluster.lab)} mono />
        </div>
      </div>

      <Centroids centroids={cluster.centroids} noiseCount={cluster.noiseCount} />

      {cluster.clusterCount !== null || cluster.samplesUsed !== null ? (
        <p className="colorrow__meta">
          {cluster.clusterCount !== null ? `${cluster.clusterCount} clusters` : null}
          {cluster.clusterCount !== null && cluster.samplesUsed !== null ? ' • ' : null}
          {cluster.samplesUsed !== null
            ? `${formatCount(cluster.samplesUsed)} samples used`
            : null}
        </p>
      ) : null}

      {cluster.representative ? (
        <p className="colorrow__basis">{cluster.representative}</p>
      ) : null}
    </div>
  )
}

export default function FlameCharacteristics({ color }) {
  if (!color) return null
  const { algorithms, mean, flamePixelCount, samplesUsed, pixelsSampled, nClusters } = color

  const rows = CLUSTERING_KEYS.map(({ key, label }) => ({
    key,
    label,
    cluster: algorithms?.[key] ?? null,
  })).filter((row) => row.cluster)

  if (!rows.length && !mean) return null

  return (
    <Card className="result-card">
      <CardHeader
        icon={Palette}
        title="Flame Characteristics"
        meta={rows.length ? `${rows.length} algorithms` : 'Color analysis'}
      />

      <div className="colors">
        {rows.map((row) => (
          <ColorRow key={row.key} label={row.label} cluster={row.cluster} />
        ))}

        {mean ? (
          <div className="colorrow colorrow--mean">
            <div className="colorrow__head">
              <span className="colorrow__label">Mean Colour</span>
            </div>
            <div className="colorrow__body">
              <span
                className="swatch"
                style={rgbToCss(mean.rgb) ? { background: rgbToCss(mean.rgb) } : undefined}
                aria-hidden="true"
              />
              <div className="colorrow__values">
                <DataRow label="RGB" value={formatRgb(mean.rgb)} mono />
                <DataRow label="LAB" value={formatLab(mean.lab)} mono />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {flamePixelCount !== null ||
      samplesUsed !== null ||
      pixelsSampled !== null ||
      nClusters !== null ? (
        <div className="drow-list">
          {flamePixelCount !== null ? (
            <DataRow label="Flame pixels" value={formatCount(flamePixelCount)} mono />
          ) : null}
          {samplesUsed !== null ? (
            <DataRow label="Samples used" value={formatCount(samplesUsed)} mono />
          ) : null}
          {nClusters !== null ? <DataRow label="Clusters (k)" value={String(nClusters)} mono /> : null}
          {pixelsSampled !== null ? (
            <DataRow label="Pixels sampled" value={pixelsSampled ? 'Yes' : 'No'} />
          ) : null}
        </div>
      ) : null}

      {color.skippedReason ? (
        <p className="alert alert--error" role="note">
          {color.skippedReason}
        </p>
      ) : null}

      <PanelNote>
        Each row is one clustering algorithm run on the segmented flame pixels in CIELAB, reported
        with its own cluster centroids. Swatches are rendered from the numeric RGB values returned by
        the model. No colour names or fuel labels are inferred.
      </PanelNote>
    </Card>
  )
}
