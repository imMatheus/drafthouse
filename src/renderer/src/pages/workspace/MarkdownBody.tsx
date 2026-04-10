import Markdown from 'react-markdown'

interface MarkdownBodyProps {
  children: string
}

export default function MarkdownBody({ children }: MarkdownBodyProps) {
  return (
    <div className="p-4 text-sm leading-relaxed text-foreground-muted [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-foreground-subtle [&_code]:rounded [&_code]:bg-interactive [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-3 [&_pre>code]:block [&_pre>code]:p-3 [&_pre]:rounded-md [&_pre]:bg-interactive [&_ul]:list-disc">
      <Markdown>{children}</Markdown>
    </div>
  )
}
