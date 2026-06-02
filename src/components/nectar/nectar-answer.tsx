import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a NECTAR answer as clean markdown with compact citation tags.
 * - Bullets, bold section labels, italic notes render naturally.
 * - Inline `code` spans are styled as small "source tag" chips (e.g. `SOW · 1.8`).
 * - No raw "###" or "**" should ever leak through.
 */
export function NectarAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[#0f1b3d] [&_strong]:font-semibold [&_em]:text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-1.5 list-disc space-y-1 pl-5 marker:text-[#d97a1c]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[#0f1b3d]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="not-italic text-xs text-muted-foreground">{children}</em>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-[#d97a1c] underline underline-offset-2 hover:text-[#b8651a]">
              {children}
            </a>
          ),
          // Citation chips: `SOW · 1.8`
          code: ({ children }) => (
            <span className="ml-1 inline-flex items-center rounded border border-[#fed7aa] bg-[#fff7ed] px-1.5 py-0.5 align-baseline text-[10px] font-medium uppercase tracking-wide text-[#9a3412]">
              {children}
            </span>
          ),
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          hr: () => <hr className="my-2 border-[#fed7aa]" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
