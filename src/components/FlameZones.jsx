import { Layers } from 'lucide-react'
import { Card, CardHeader, DataRow, PanelNote } from './ui'
import { rgbToCss, formatRgb, formatLab, ZONE_KEYS } from '../services/normalize'
import { formatCount } from '../utils/format'

/**
 * One spatial flame zone: its representative colour, pixel count and share of the
 * segmented mask.  The percentages shown are the engineering analysis weights
 * (40/35/25), NOT universal physical flame percentages and NOT the pixel shares.
 */
function Zone({ zone, label, weight }) {
  if (!zone) return null
  const mean = zone.meanColor
  const swatch = rgbToCss(mean?.rgb)

  return (
    <div className="zone">
      <div className="zone__head">
        <span className="zone__label">{label}</span>
        <span className="zone__weight is-mono">{Math.round((weight ?? 0) * 100)}%</span>
      </div>

      <div className="zone__body">
        <span
          className="swatch"
          style={swatch ? { background: swatch } : undefined}
          aria-hidden={swatch ? 'true' : undefined}
        >
          {swatch ? null : 'n/a'}
        </span>
        <div className="zone__values">
          <DataRow label="RGB" value={formatRgb(mean?.rgb)} mono />
          <DataRow label="LAB" value={formatLab(mean?.lab)} mono />
        </div>
      </div>

      <p className="zone__meta">
        {zone.pixelCount !== null && zone.pixelCount !== undefined ? (
          <span>{formatCount(zone.pixelCount)} px</span>
        ) : null}
        {zone.percentageOfMask !== null && zone.percentageOfMask !== undefined ? (
          <span>{(zone.percentageOfMask).toFixed(1)}% of mask</span>
        ) : null}
      </p>
    </div>
  )
}

export default function FlameZones({ color }) {
  const zones = color?.zones
  if (!zones) return null

  const present = ZONE_KEYS.filter(({ key }) => zones[key])
  if (!present.length) return null

  return (
    <Card className="result-card">
      <CardHeader icon={Layers} title="Flame Zones" meta="Spatial depth layers" />

      <div className="zones">
        {present.map(({ key, label, weight }) => (
          <Zone key={key} zone={zones[key]} label={label} weight={weight} />
        ))}
      </div>

      <PanelNote>
        Spatial depth layers derived from the segmentation mask by distance to the flame boundary.
        The percentages are engineering analysis weights (inner 40%, middle 35%, outer 25%), not
        universal physical flame percentages. The whole-mask mean colour is reported separately and
        is calculated from every segmented pixel.
      </PanelNote>
    </Card>
  )
}
