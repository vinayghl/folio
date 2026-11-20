# Folio Workspace

**Every Document. One Workspace.**
A free, privacy-first online document workspace built with React, TypeScript, Vite, and Tailwind CSS. Open, create, edit, convert, and download PDFs, Word documents, spreadsheets, presentations, images, and code/text files directly in your browser.

---

## Core Capabilities

- **PDF Workspace (`pdfjs-dist` + `pdf-lib`)**: Render pages, select and copy text, search across pages, highlight, add text boxes and comments, draw freehand, insert shapes and images, draw/type signatures, rotate/reorder/delete/extract pages, split, merge, compress, and export edited PDFs or convert to DOCX/PNG/TXT.
- **Word Document Editor (`@tiptap/react` + `mammoth` + `docx`)**: Import `.docx`, `.odt`, `.rtf`, and extract `.doc`; edit with headings, fonts, colors, highlights, alignment, lists, tables, images, links, page breaks, find & replace, live word count/outline, auto-save, and export to `.docx`, `.pdf`, `.rtf`, `.html`, or `.txt`.
- **Spreadsheet Editor (`xlsx` SheetJS)**: Import and export `.xlsx`, `.xls`, `.csv`, `.ods`; multi-sheet tabs, editable formula bar (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, arithmetic), cell formatting, row/column management, sorting, filtering, copy/paste, and Bar/Line SVG charts.
- **Presentation Studio (`jszip` + `pptxgenjs`)**: Import `.pptx`, `.odp`, and extract `.ppt`; create and reorder slides, edit text boxes, add shapes and images, customize backgrounds and transitions, run fullscreen Presentation Mode, and export to `.pptx` or `.pdf`.
- **Image Studio (Canvas API)**: View, zoom, resize with aspect-ratio lock, interactive crop, rotate/flip, adjust brightness/contrast/grayscale, compress quality with live estimated output size, and export to PNG, JPG, WEBP, or PDF.
- **Conversion Center**: PDF ↔ DOCX, DOCX → PDF, PDF ↔ Images, XLSX ↔ CSV, PPTX → PDF, HTML → PDF, and TXT → PDF.

---

## Privacy & Storage Architecture

- **100% Client-Side Processing**: All document parsing, rendering, editing, and conversion happen locally inside browser memory using Web APIs and open-source libraries. Heavy PDF and spreadsheet tasks run off the main UI thread via a dedicated Web Worker (`src/workers/docWorker.ts`).
- **Zero Backend, Zero Accounts, Zero External Uploads**: No Supabase, no Firebase, no external databases, and no document uploads to remote servers.
- **Local Draft Persistence & Browser Limitations**: Documents and non-destructive working drafts are cached locally in browser `IndexedDB` (`folio_workspace_db`), preserving original uploaded bytes alongside edits. Because `IndexedDB` is browser-scoped, clearing site data, switching browsers, or closing a Private/Incognito window removes cached drafts—users should always download finished files to disk. Theme preference is stored lightly in `localStorage`.

---

## Local Setup

```bash
npm install
npm run dev
```

The development server runs at `http://localhost:3000`.

### Type Check & Production Build

```bash
npm run lint
npm run build
```

---

## Free Deployment Instructions

Because all document processing executes in the browser, Folio compiles into static assets (`dist/`) and can be deployed **completely free** on any static host:

1. **Cloudflare Pages / Vercel / Netlify**:
   - Connect your repository.
   - Build command: `npm run build`
   - Output directory: `dist`
2. **Docker / Static Nginx**:
   - Run `npm run build` and serve `dist/` with Nginx or Caddy.
