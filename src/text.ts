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
