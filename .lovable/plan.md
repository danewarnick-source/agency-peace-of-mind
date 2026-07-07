## Problem

In the client Files tab, clicking **Open** on a document doesn't always show the file in its native format:

- **Client-source docs** (PCSP uploaded to `client-documents` bucket) already open the signed URL, so PDFs render inline and DOCX/others download — this path is fine.
- **Nectar-source docs** (everything else) open `/dashboard/nectar-docs?doc={id}` — an internal viewer route that renders the parsed text/PDF preview, not the original DOCX/CSV/etc. So a Word doc uploaded here never opens as a Word doc.

## Plan

Frontend-only change to `src/components/clients/client-documents-card.tsx`.

Replace the nectar branch of the **Open** handler so it fetches a signed URL to the original file and opens it in a new tab, mirroring the client-source path.

- Add a `useServerFn(getDocument)` binding at the top of `ClientDocumentsCard` (already imported alongside the other nectar server fns).
- In the row's Open `onClick`:
  - If `d.source === "client"` → keep existing signed-URL flow from the `client-documents` bucket.
  - Else (nectar) → call `getDocument({ data: { documentId: d.id } })`, then `window.open(res.signedUrl, "_blank")`. Toast an error if no URL comes back.
- Remove the `window.open("/dashboard/nectar-docs?doc=…")` fallback for nectar docs. The internal viewer is still reachable from the Nectar Docs page itself; the Open button on a client's Files card is about seeing the file.

Because we hand the browser the raw file URL with its stored `mime_type`, PDFs render inline, DOCX/XLSX/CSV/TXT download or open in the OS handler — native behavior per file type, as requested.

## Verification

On the client Files tab:
- Open on a PDF → opens in the browser PDF viewer (new tab).
- Open on a .docx → browser downloads / hands off to Word (native).
- Open on a .txt / .csv → opens as text in the tab.
- Open on the PCSP (client-source) → unchanged.

## Out of scope

- The Nectar Docs viewer page itself (still works when navigating from Nectar Docs).
- Any bucket, MIME, or schema changes.
