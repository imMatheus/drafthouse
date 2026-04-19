import { cn } from '../lib/cn'
import { useTheme } from '../hooks/useTheme'
import asciiArtDark from '../assets/ascii-art-dark.gif'
import asciiArtLight from '../assets/ascii-art-light.gif'

interface AsciiArtProps {
  alt?: string
  className?: string
}

export default function AsciiArt({ alt = '', className }: AsciiArtProps) {
  const { theme } = useTheme()
  const src = theme === 'dark' ? asciiArtDark : asciiArtLight
  return <img src={src} alt={alt} className={cn('w-56 h-48', className)} />
}
