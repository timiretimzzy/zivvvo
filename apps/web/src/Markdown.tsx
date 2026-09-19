/**
 * D12: Safe Markdown renderer for AI tutor responses.
 *
 * Renders Markdown from the LLM using react-markdown + remark-gfm.
 * Strips raw HTML for security. Applies consistent styling.
 */
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

export default function SafeMarkdown({ content, className = "" }: SafeMarkdownProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Strip all HTML for security
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-3 italic text-ink-dim my-2">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-line">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-line/50">{children}</tr>,
        th: ({ children }) => <th className="text-left py-1 px-2 font-semibold text-xs">{children}</th>,
        td: ({ children }) => <td className="py-1 px-2">{children}</td>,
        hr: () => <hr className="border-line my-3" />,
        a: ({ href, children }) => (
          <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">{children}</a>
        ),
        code: ({ children, className: codeClassName }) => {
          const isBlock = codeClassName?.includes("language-");
          return isBlock ? (
            <pre className="bg-surface-2/60 rounded-lg p-2 my-2 overflow-x-auto text-xs">
              <code>{children}</code>
            </pre>
          ) : (
            <code className="bg-surface-2/60 px-1 py-0.5 rounded text-xs">{children}</code>
          );
        },
      }}
      allowedElements={["p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr", "a", "code", "pre", "br"]}
      className={`text-sm leading-relaxed ${className}`}
    >
      {content}
    </Markdown>
  );
}
