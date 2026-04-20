import { useEffect, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/cn'
import { tokenizeCode, type HighlightedToken } from '../../lib/shiki'
import { useTheme } from '../../hooks/useTheme'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import PRPill, { parsePRUrl } from '../../components/PRPill'

interface MarkdownBodyProps {
  children: string
  className?: string
}

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const { theme } = useTheme()
  const [tokens, setTokens] = useState<HighlightedToken[][] | null>(null)

  const code = String(children).replace(/\n$/, '')
  const lang = className?.replace('language-', '') ?? 'plaintext'

  useEffect(() => {
    let cancelled = false
    tokenizeCode(code, lang, theme)
      .then((result) => {
        if (!cancelled) setTokens(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [code, lang, theme])

  if (!tokens) {
    return (
      <pre className="bg-interactive rounded-md">
        <code className="block p-3 text-xs">{code}</code>
      </pre>
    )
  }

  return (
    <pre className="bg-interactive rounded-md">
      <code className="block p-3 text-xs">
        {tokens.map((line, i) => (
          <span key={i}>
            {i > 0 && '\n'}
            {line.map((token, j) => (
              <span key={j} style={token.color ? { color: token.color } : undefined}>
                {token.content}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  )
}

const remarkPlugins = [remarkGfm]

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const ctx = useWorkspaceContext()
  const pr = parsePRUrl(href)
  if (pr && href) {
    const matchesRepo = ctx?.gitInfo && ctx.gitInfo.owner === pr.owner && ctx.gitInfo.repo === pr.repo
    return (
      <PRPill
        owner={pr.owner}
        repo={pr.repo}
        number={pr.number}
        href={href}
        onClick={matchesRepo && ctx ? () => ctx.onOpenPullRequest(pr.number) : undefined}
      />
    )
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

const markdownComponents = {
  pre({ children }: { children?: ReactNode }) {
    return <>{children}</>
  },
  code({ className, children, ...props }: { className?: string; children?: ReactNode }) {
    const isBlock = className?.startsWith('language-')
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  a: MarkdownLink
}

export default function MarkdownBody({ children, className }: MarkdownBodyProps) {
  return (
    <div
      className={cn(
        'text-foreground-muted [&_a]:text-accent [&_blockquote]:border-border [&_blockquote]:text-foreground-subtle [&_code]:bg-interactive [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_pre]:bg-interactive [&_td]:border-border [&_th]:border-border [&_th]:text-foreground [&_del]:text-foreground-subtle text-sm leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:whitespace-pre [&_del]:line-through [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_img]:max-w-full [&_img]:rounded [&_input[type=checkbox]]:mr-1.5 [&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-3 [&_pre]:rounded-md [&_pre>code]:block [&_pre>code]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc',
        className
      )}
    >
      <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {children}
      </Markdown>
    </div>
  )
}
