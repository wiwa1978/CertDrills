"use client";

import { useEffect, useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MarkdownPreviewProps = {
  markdown: string;
  emptyText?: string;
};

type InlineParseState = {
  key: number;
};

type MarkdownTextareaProps = ComponentProps<typeof Textarea> & {
  id: string;
  label: string;
  helperText?: string;
  errorMessages?: string[];
};

export function MarkdownTextarea({
  id,
  label,
  helperText,
  errorMessages = [],
  className,
  required,
  ...props
}: MarkdownTextareaProps) {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const describedBy = [
    errorMessages.length > 0 ? errorId : undefined,
    helperText ? helperId : undefined,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}{required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}</Label>
        <span className="text-xs text-muted-foreground">Markdown supported</span>
      </div>
      <Textarea
        id={id}
        className={className}
        required={required}
        aria-invalid={errorMessages.length > 0 || undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {errorMessages.length > 0 ? (
        <div id={errorId} role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <ul className="list-disc space-y-1 pl-5">
            {errorMessages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {helperText ? <p id={helperId} className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

export function MarkdownTextareaWithPreview({
  id,
  label,
  previewLabel,
  helperText,
  className,
  defaultValue,
  onChange,
  ...props
}: ComponentProps<typeof Textarea> & { id: string; label: string; previewLabel: string; helperText?: string }) {
  const [markdown, setMarkdown] = useState(String(defaultValue ?? ""));

  useEffect(() => {
    setMarkdown(String(defaultValue ?? ""));
  }, [defaultValue]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setMarkdown(event.currentTarget.value);
    onChange?.(event);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>{label}{props.required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}</Label>
          <span className="text-xs text-muted-foreground">Markdown supported</span>
        </div>
        <Textarea id={id} className={className} value={markdown} onChange={handleChange} {...props} />
        {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      </div>
      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{previewLabel}</div>
        <MarkdownPreview markdown={markdown} />
      </div>
    </div>
  );
}

export function MarkdownPreview({ markdown, emptyText = "Nothing to preview yet." }: MarkdownPreviewProps) {
  const blocks = parseMarkdownBlocks(markdown);

  if (blocks.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyText}</div>;
  }

  return <div className="space-y-3 text-sm leading-6">{blocks}</div>;
}

function parseMarkdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^```(?:[A-Za-z0-9_-]+)?\s*$/);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`block-${blocks.length}`} className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-5">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^(?: {4}|\t)/.test(line)) {
      const codeLines: string[] = [];

      while (index < lines.length && /^(?: {4}|\t)/.test(lines[index] ?? "")) {
        codeLines.push((lines[index] ?? "").replace(/^(?: {4}|\t)/, ""));
        index += 1;
      }

      blocks.push(
        <pre key={`block-${blocks.length}`} className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-5">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const content = parseInlineMarkdown(headingMatch[2] ?? "");

      if (level === 1) {
        blocks.push(<h2 key={`block-${blocks.length}`} className="text-base font-semibold text-foreground">{content}</h2>);
      } else if (level === 2) {
        blocks.push(<h3 key={`block-${blocks.length}`} className="font-semibold text-foreground">{content}</h3>);
      } else {
        blocks.push(<h4 key={`block-${blocks.length}`} className="font-medium text-foreground">{content}</h4>);
      }

      index += 1;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      if (nextLine.trim() === "" || /^```/.test(nextLine) || /^(#{1,3})\s+/.test(nextLine) || /^(?: {4}|\t)/.test(nextLine)) break;
      paragraphLines.push(nextLine.trim());
      index += 1;
    }

    blocks.push(<p key={`block-${blocks.length}`}>{parseInlineMarkdown(paragraphLines.join(" "))}</p>);
  }

  return blocks;
}

function parseInlineMarkdown(markdown: string): ReactNode[] {
  const state: InlineParseState = { key: 0 };
  return parseInlineSegment(markdown, state);
}

function parseInlineSegment(markdown: string, state: InlineParseState): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;

  const flushBuffer = () => {
    if (buffer) {
      nodes.push(buffer);
      buffer = "";
    }
  };

  while (index < markdown.length) {
    if (markdown[index] === "`") {
      const end = markdown.indexOf("`", index + 1);
      if (end > index + 1) {
        flushBuffer();
        nodes.push(<code key={`inline-${state.key++}`}>{markdown.slice(index + 1, end)}</code>);
        index = end + 1;
        continue;
      }
    }

    if (markdown.startsWith("**", index)) {
      const end = markdown.indexOf("**", index + 2);
      if (end > index + 2) {
        flushBuffer();
        nodes.push(<strong key={`inline-${state.key++}`}>{parseInlineSegment(markdown.slice(index + 2, end), state)}</strong>);
        index = end + 2;
        continue;
      }
    }

    if (markdown[index] === "[") {
      const labelEnd = markdown.indexOf("]", index + 1);
      const hrefStart = labelEnd + 1;
      const hrefEnd = markdown.indexOf(")", hrefStart + 1);

      if (labelEnd > index + 1 && markdown[hrefStart] === "(" && hrefEnd > hrefStart + 1) {
        const label = markdown.slice(index + 1, labelEnd);
        const href = safeHref(markdown.slice(hrefStart + 1, hrefEnd));
        flushBuffer();

        if (href) {
          nodes.push(
            <a key={`inline-${state.key++}`} href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">
              {parseInlineSegment(label, state)}
            </a>,
          );
        } else {
          nodes.push(parseInlineSegment(label, state));
        }

        index = hrefEnd + 1;
        continue;
      }
    }

    buffer += markdown[index];
    index += 1;
  }

  flushBuffer();
  return nodes;
}

function safeHref(href: string) {
  const trimmed = href.trim();

  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}
