import * as XLSX from 'xlsx';
import { StoredDocument } from '../types/workspace';
import { htmlToDocxBuffer, slidesToPptxBuffer, SlideData } from './officeParsers';
import { createBlankPdfBytes } from './pdfEngine';
import { saveStoredDocument } from './storage';

export async function createNewWorkspaceDoc(
  kind: 'word' | 'spreadsheet' | 'presentation' | 'pdf' | 'txt' | 'html' | 'json'
): Promise<StoredDocument> {
  const now = Date.now();
  const id = crypto.randomUUID ? crypto.randomUUID() : `doc_${now}_${Math.random().toString(36).slice(2, 7)}`;

  let name = 'Untitled';
  let ext = 'txt';
  let buffer: ArrayBuffer;
  let workspace: StoredDocument['workspace'] = 'code';
  let category: StoredDocument['category'] = 'documents';

  if (kind === 'word') {
    name = 'Untitled Document.docx';
    ext = 'docx';
    workspace = 'word';
    category = 'documents';
    buffer = await htmlToDocxBuffer(
      '<h1>Untitled Document</h1><p>Start typing here. You can format text, insert tables or images, find and replace, and export to DOCX, PDF, HTML, or RTF.</p>'
    );
  } else if (kind === 'spreadsheet') {
    name = 'Untitled Workbook.xlsx';
    ext = 'xlsx';
    workspace = 'spreadsheet';
    category = 'spreadsheets';
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Item', 'Category', 'Quantity', 'Unit Price', 'Total'],
      ['Design Audit', 'Services', 4, 150, '=C2*D2'],
      ['Hosting Tier', 'Infrastructure', 12, 29, '=C3*D3'],
      ['Support Hours', 'Operations', 8, 95, '=C4*D4'],
      ['Grand Total', '', '', '', '=SUM(E2:E4)'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Budget');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    buffer = out;
  } else if (kind === 'presentation') {
    name = 'Untitled Presentation.pptx';
    ext = 'pptx';
    workspace = 'presentation';
    category = 'presentations';
    const slides: SlideData[] = [
      {
        id: 'slide_init_1',
        background: '#ffffff',
        transition: 'fade',
        layout: 'title',
        elements: [
          {
            id: 'el_init_title',
            type: 'text',
            x: 10,
            y: 28,
            w: 80,
            h: 18,
            text: 'Untitled Presentation',
            fontSize: 40,
            bold: true,
            align: 'center',
            color: '#0f172a',
          },
          {
            id: 'el_init_sub',
            type: 'text',
            x: 15,
            y: 50,
            w: 70,
            h: 16,
            text: 'Click any element to edit text, drag to reposition, or add new slides.',
            fontSize: 20,
            align: 'center',
            color: '#475569',
          },
        ],
      },
      {
        id: 'slide_init_2',
        background: '#f8fafc',
        transition: 'slide',
        layout: 'title-body',
        elements: [
          {
            id: 'el_init_s2_title',
            type: 'text',
            x: 8,
            y: 12,
            w: 84,
            h: 14,
            text: 'Key Highlights',
            fontSize: 32,
            bold: true,
            align: 'left',
            color: '#0f172a',
          },
          {
            id: 'el_init_s2_body',
            type: 'text',
            x: 8,
            y: 30,
            w: 84,
            h: 50,
            text: '• Add text boxes, shapes, and images\n• Customize slide backgrounds and transitions\n• Export directly to PowerPoint (.pptx) or PDF',
            fontSize: 20,
            align: 'left',
            color: '#334155',
          },
        ],
      },
    ];
    buffer = await slidesToPptxBuffer(slides, 'Untitled Presentation');
  } else if (kind === 'pdf') {
    name = 'Untitled Document.pdf';
    ext = 'pdf';
    workspace = 'pdf';
    category = 'documents';
    buffer = await createBlankPdfBytes('Untitled PDF Document');
  } else if (kind === 'html') {
    name = 'untitled.html';
    ext = 'html';
    workspace = 'code';
    category = 'other';
    const html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Untitled Document</title>\n  <style>\n    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; color: #0f172a; line-height: 1.6; }\n  </style>\n</head>\n<body>\n  <h1>Hello from Folio Workspace</h1>\n  <p>Edit this HTML document with live preview, or export directly to PDF.</p>\n</body>\n</html>`;
    buffer = new TextEncoder().encode(html).buffer;
  } else if (kind === 'json') {
    name = 'data.json';
    ext = 'json';
    workspace = 'code';
    category = 'other';
    const json = JSON.stringify({ workspace: 'Folio', free: true, privacy: 'local-first', items: [1, 2, 3] }, null, 2);
    buffer = new TextEncoder().encode(json).buffer;
  } else {
    name = 'notes.txt';
    ext = 'txt';
    workspace = 'code';
    category = 'documents';
    buffer = new TextEncoder().encode('Notes\n\nStart writing plain text here.').buffer;
  }

  const doc: StoredDocument = {
    id,
    name,
    ext,
    size: buffer.byteLength,
    workspace,
    category,
    lastModified: now,
    createdAt: now,
    originalData: buffer,
  };
  await saveStoredDocument(doc);
  return doc;
}
