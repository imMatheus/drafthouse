import { useEffect, useRef, useState } from 'react'

// Copies text to the clipboard and flips `copied` to true for `resetMs`. The
// reset timer is cleared on unmount so the state update can't fire after the
// component is gone.
export function useCopyToClipboard(resetMs = 1500): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const copy = (text: string): void => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setCopied(false), resetMs)
      })
      .catch(() => {})
  }

  return { copied, copy }
}
