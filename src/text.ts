/** Strip terminal controls without flattening multiline issue content. */
export function readableText(value: string): string {
  return Bun.stripANSI(value).replace(/[\p{Cf}\p{Cc}]/gu, (char) =>
    char === "\n" || char === "\t" ? char : " ",
  );
}

export function displayText(value: string): string {
  return readableText(value).replace(/\s+/g, " ").trim();
}

export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error)
    return displayText(String(error.message));
  return "Unable to reach the Beads plugin. Check the server plugin installation, then refresh.";
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Explicit UTF-8 truncation without splitting a Unicode code point. */
export function boundedText(value: string, budget: number): string {
  const text = readableText(value);
  if (utf8Bytes(text) <= budget) return text;
  const suffix = "… [truncated; inspect full bead]";
  let result = "";
  let bytes = utf8Bytes(suffix);
  for (const char of text) {
    bytes += utf8Bytes(char);
    if (bytes > budget) break;
    result += char;
  }
  return result + suffix;
}
