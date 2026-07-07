## Goal

Replace the "open in a new tab / download" behavior on a client document with an in-app preview dialog that lets the user scroll through the file and, from the same dialog, download it.

## UX

- Click **Open** on a Files-tab row → a large modal (`Dialog`, ~90vw × 85vh) opens.
- Header: file title, badge with file type, and a **Download** button (+ close X).
- Body: scrollable preview area sized to the dialog. Content depends on file type:
  - **PDF** → `<iframe src={signedUrl}>` (browser's native PDF viewer, full scroll/zoom).
  - **Images** (png/jpg/jpeg/gif/webp/svg) → `<img>` with `object-contain`, scrollable.
  - **Plain text / CSV / MD / JSON / HTML source** → fetch text from signed URL, render in a `<pre>` (or highlighted `<code>` for JSON).
  - **DOCX** → convert to HTML in the browser with `mammoth` (already Worker-safe; runs client-side), render inside a styled scroll container.
  - **DOC (legacy)** or anything unrecognized → show a "Preview not available for this file type" message with the Download button front-and-center.
- Download button = anchor to the signed URL with `download={file_name}` attribute so the browser saves the original file with its real name.

## Implementation

New file: `src/components/clients/document-preview-dialog.tsx`
- Props: `{ open, onOpenChange, doc: { id, fileName, mimeType?, signedUrl } }`
- Detect kind from `mimeType` first, fall back to filename extension.
- For DOCX: `bun add mammoth` (browser build). Lazy-import inside the DOCX branch so it isn't loaded until needed. Fetch the file as `arrayBuffer` from the signed URL, call `mammoth.convertToHtml`, inject sanitized HTML into a `prose`-styled container.
- Loading state (spinner) while fetching text / DOCX conversion.
- Error state falls back to the "download instead" panel.

Edit: `src/components/clients/client-documents-card.tsx`
- Add local state `previewDoc: { id, fileName, mimeType, signedUrl } | null`.
- Rewrite the row **Open** handler:
  - Client-source → generate signed URL from `client-documents` bucket, then open the preview dialog with `{ fileName: d.file_name, mimeType: <derive>, signedUrl }`.
  - Nectar-source → `getDocFn({ data: { documentId: d.id } })` → open the preview dialog with `{ fileName: doc.file_name, mimeType: doc.mime_type, signedUrl }`.
- Render `<DocumentPreviewDialog />` next to the existing dialogs.

### DocRow shape

Add `mime_type` to the nectar branch of the merge query (already selected in the server fn) so we can pass it to the dialog without an extra round trip. Client-source rows can pass `null` — the dialog derives type from extension.

## Verification

On the client Files tab:
- PDF → preview scrolls in the dialog; Download saves the PDF.
- .docx → renders as formatted HTML in the dialog; Download saves the original .docx.
- .png/.jpg → image renders inside the scroll area.
- .txt/.csv/.json → text renders in a `<pre>`.
- .doc or unknown type → "Preview not available" panel with Download button.
- Existing PCSP (client-source) preview and Nectar-source preview both work.

## Out of scope

- No changes to the standalone Nectar Docs page.
- No server-side rendering of DOCX / no new server functions.
- No editing or annotation inside the preview.
