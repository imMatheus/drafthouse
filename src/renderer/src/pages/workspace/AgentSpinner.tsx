import { useEffect, useState } from 'react'

const FRAMES = ['✶', '✸', '✹', '✺', '✹', '✷']

export default function AgentSpinner({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length)
    }, 150)
    return () => clearInterval(interval)
  }, [])

  return <span className="w-2 text-sm">{FRAMES[frame]}</span>
}
