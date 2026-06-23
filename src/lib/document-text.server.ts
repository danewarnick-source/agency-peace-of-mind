// Shared text extractors for PDF / DOCX uploads. Server-only.
// Promoted out of smart-import.functions.ts so multiple flows (Smart Import,
// per-client uploads, NectarAsk upload+extract) can reuse one path.

export async function extractPdfText(buf: Buffer): Promise<string> {
  // unpdf is Worker-compatible (no native deps).
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : (text ?? "");
}

export async function extractDocxText(buf: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (mammoth as any).extractRawText({ buffer: buf });
  return (result?.value as string) ?? "";
}

/** Routes a file (by name / mime) to the right extractor. Empty string on unknown. */
export async function extractTextFromUpload(
  buf: Buffer,
  fileName: string,
  mimeType?: string | null,
): Promise<string> {
  const f = fileName.toLowerCase();
  const m = (mimeType ?? "").toLowerCase();
  if (f.endsWith(".pdf") || m.includes("pdf")) return extractPdfText(buf);
  if (f.endsWith(".docx") || m.includes("word")) return extractDocxText(buf);
  if (f.endsWith(".txt") || m.startsWith("text/")) return buf.toString("utf8");
  return "";
}
