import { Fragment, type ReactNode } from "react";

// Small, inert subset of review Markdown. Repository comments never become raw
// HTML, scripts, embedded images or executable links in the dashboard.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-secondary px-1 text-xs">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function blocks(body: string): ReactNode {
  return body.trim().split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => {
    const lines = paragraph.split("\n");
    if (lines.every(line => /^[-*] /.test(line))) return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((line, i) => <li key={i}>{inline(line.slice(2))}</li>)}</ul>;
    return <p key={index} className="whitespace-pre-wrap break-words leading-relaxed">{inline(paragraph.replace(/^#{1,4} /, ""))}</p>;
  });
}

export function ReviewBody({ body }: { body: string }) {
  const severity = body.match(/^\*\*([🔴🟠🟡]\s*)?(Critical|Major|Minor)\s*·\s*([^*\n]{1,80})\*\*\s*/u);
  const content = severity ? body.slice(severity[0].length) : body;
  const tones = { Critical: "review-status-error", Major: "review-status-warning", Minor: "review-status-info" };
  const symbols = { Critical: "🔴", Major: "🟠", Minor: "🟡" };
  const level = severity?.[2] as keyof typeof tones | undefined;
  const details = /<details>\s*<summary>([^<>\n]{1,100})<\/summary>\s*([\s\S]*?)<\/details>/g;
  const sections: ReactNode[] = [];
  let cursor = 0;
  for (const match of content.matchAll(details)) {
    sections.push(<Fragment key={`text-${cursor}`}>{blocks(content.slice(cursor, match.index))}</Fragment>);
    sections.push(<details key={`details-${match.index}`} className="rounded-md border border-border/60 bg-secondary/20 p-3"><summary className="cursor-pointer font-medium text-muted-foreground">{inline(match[1])}</summary><div className="mt-3 space-y-3">{blocks(match[2])}</div></details>);
    cursor = match.index! + match[0].length;
  }
  sections.push(<Fragment key={`text-${cursor}`}>{blocks(content.slice(cursor))}</Fragment>);
  return <div className="mt-3 space-y-3">
    {level && <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${tones[level]}`}><span aria-hidden="true">{symbols[level]}</span>{level} · {severity![3]}</span>}
    {sections}
  </div>;
}
