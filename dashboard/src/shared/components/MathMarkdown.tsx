import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MathMarkdownProps {
  children: string;
  className?: string;
}

const KATEX_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
];

export function MathMarkdown({ children, className = "markdown-body" }: MathMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const tryRender = () => {
      if (cancelled || !containerRef.current) return;
      const renderMath = (window as any).renderMathInElement;
      if (typeof renderMath === "function") {
        try {
          renderMath(containerRef.current, {
            delimiters: KATEX_DELIMITERS,
            ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
            throwOnError: false,
          });
        } catch {
          // Fallback cleanly to plain text if KaTeX encounters malformed expression
        }
        return;
      }
      if (attempts < 15) {
        attempts += 1;
        window.setTimeout(tryRender, 120);
      }
    };

    tryRender();
    return () => {
      cancelled = true;
    };
  }, [children]);

  return (
    <div ref={containerRef} key={children} className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
