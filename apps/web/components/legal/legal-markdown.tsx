import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Block, Inline } from "@/lib/legal/markdown";

function renderInlines(inlines: Inline[]): ReactNode[] {
  return inlines.map((inline, index) => {
    switch (inline.kind) {
      case "bold":
        return (
          <strong key={index} className="font-semibold text-text">
            {inline.text}
          </strong>
        );
      case "link":
        return inline.href.startsWith("/") ? (
          <Link key={index} href={inline.href} className="text-accent">
            {inline.text}
          </Link>
        ) : (
          <a
            key={index}
            href={inline.href}
            className="text-accent"
            rel="noopener noreferrer"
          >
            {inline.text}
          </a>
        );
      default:
        return inline.text;
    }
  });
}

/** Parsed legal Markdown → the page's typography. The `#` title is rendered by the page. */
export function LegalMarkdown({ blocks }: { blocks: Block[] }) {
  return (
    <div className="legal-document">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            if (block.level === 1) return null;
            return block.level === 2 ? (
              <h2
                key={index}
                className="mt-8 text-[17px] font-semibold text-text"
              >
                {renderInlines(block.inlines)}
              </h2>
            ) : (
              <h3
                key={index}
                className="mt-5 text-[15px] font-semibold text-text"
              >
                {renderInlines(block.inlines)}
              </h3>
            );
          case "list":
            return (
              <ul
                key={index}
                className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInlines(item)}</li>
                ))}
              </ul>
            );
          default:
            return (
              <p
                key={index}
                className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary"
              >
                {renderInlines(block.inlines)}
              </p>
            );
        }
      })}
    </div>
  );
}
