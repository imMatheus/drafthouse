import { splitTextIntoMentionSegments } from '../lib/prMentions'

/**
 * Renders user-authored text with `@prN` references painted in the accent
 * color, matching the overlay highlight in the agent prompt bar. Safe for any
 * string — falls through to the raw text when no mentions are present.
 */
export default function HighlightedMentionText({ text }: { text: string }) {
  const segments = splitTextIntoMentionSegments(text)
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <span key={i} className="bg-accent/15 text-accent rounded-[3px] font-medium">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}
