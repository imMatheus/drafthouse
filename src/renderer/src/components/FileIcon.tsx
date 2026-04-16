import { cn } from '../lib/cn'
import { getFileIconUrl, getFolderIconUrl } from '../lib/fileIcons'

export function FileIcon({
  name,
  size = 14,
  className
}: {
  name: string
  size?: number
  className?: string
}) {
  const url = getFileIconUrl(name)
  return <img src={url} alt="" width={size} height={size} className={cn('shrink-0', className)} draggable={false} />
}

export function FolderIcon({
  name,
  open = false,
  size = 14,
  className
}: {
  name: string
  open?: boolean
  size?: number
  className?: string
}) {
  const url = getFolderIconUrl(name, open)
  return <img src={url} alt="" width={size} height={size} className={cn('shrink-0', className)} draggable={false} />
}
