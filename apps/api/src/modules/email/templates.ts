function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function buildActionEmail(options: {
  greetingName?: string | null;
  instruction: string;
  url: string;
}) {
  const greeting = options.greetingName ? `Hello ${options.greetingName}, ` : "";
  const text = `${greeting}${options.instruction}: ${options.url}`;

  return {
    html: `<p>${escapeHtml(greeting)}${escapeHtml(options.instruction)}: <a href="${escapeHtml(options.url)}">${escapeHtml(options.url)}</a></p>`,
    text,
  };
}
