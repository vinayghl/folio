export type WorkspaceKind =
  | 'pdf'
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'code';

export type SupportTier =
  | 'Full Edit'
  | 'Annotate & Organize'
  | 'Extract & Edit'
  | 'View & Convert';

export type FormatCategory =
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'images'
  | 'other';

export interface FormatSpec {
  ext: string;
  label: string;
  mimeTypes: string[];
  category: FormatCategory;
  workspace: WorkspaceKind;
  tier: SupportTier;
  notes: string;
  canExportAs: string[];
}

export const FORMAT_SPECS: Record<string, FormatSpec> = {
  pdf: {
    ext: 'pdf',
    label: 'PDF Document',
    mimeTypes: ['application/pdf'],
    category: 'documents',
    workspace: 'pdf',
    tier: 'Annotate & Organize',
    notes: 'View, search, select text, annotate, draw, sign, rotate, reorder, merge, split, compress, and export.',
    canExportAs: ['PDF', 'DOCX', 'PNG', 'JPG', 'TXT'],
  },
  doc: {
    ext: 'doc',
    label: 'Legacy Word (.doc)',
    mimeTypes: ['application/msword'],
    category: 'documents',
    workspace: 'word',
    tier: 'Extract & Edit',
    notes: 'Extracts readable text from legacy binary .doc files into the rich-text editor for editing and DOCX/PDF export.',
    canExportAs: ['DOCX', 'PDF', 'HTML', 'TXT', 'RTF'],
  },
  docx: {
    ext: 'docx',
    label: 'Word Document (.docx)',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    category: 'documents',
    workspace: 'word',
    tier: 'Full Edit',
    notes: 'Full rich-text editing with headings, tables, images, formatting, find/replace, and native DOCX/PDF export.',
    canExportAs: ['DOCX', 'PDF', 'HTML', 'TXT', 'RTF'],
  },
  txt: {
    ext: 'txt',
    label: 'Plain Text (.txt)',
    mimeTypes: ['text/plain'],
    category: 'documents',
    workspace: 'code',
    tier: 'Full Edit',
    notes: 'Edit plain text directly or convert cleanly to PDF and DOCX.',
    canExportAs: ['TXT', 'PDF', 'DOCX', 'HTML'],
  },
  rtf: {
    ext: 'rtf',
    label: 'Rich Text (.rtf)',
    mimeTypes: ['application/rtf', 'text/rtf'],
    category: 'documents',
    workspace: 'word',
    tier: 'Extract & Edit',
    notes: 'Parses basic RTF formatting into the rich-text editor and exports to DOCX, PDF, or RTF.',
    canExportAs: ['RTF', 'DOCX', 'PDF', 'HTML', 'TXT'],
  },
  odt: {
    ext: 'odt',
    label: 'OpenDocument Text (.odt)',
    mimeTypes: ['application/vnd.oasis.opendocument.text'],
    category: 'documents',
    workspace: 'word',
    tier: 'Extract & Edit',
    notes: 'Reads OpenDocument XML paragraphs & headings into the rich-text editor and exports to DOCX, PDF, HTML, or TXT.',
    canExportAs: ['DOCX', 'PDF', 'HTML', 'TXT'],
  },
  xls: {
    ext: 'xls',
    label: 'Excel 97-2003 (.xls)',
    mimeTypes: ['application/vnd.ms-excel'],
    category: 'spreadsheets',
    workspace: 'spreadsheet',
    tier: 'Full Edit',
    notes: 'Edit cells, sheets, and formulas in the spreadsheet grid and export to XLSX, CSV, or PDF.',
    canExportAs: ['XLSX', 'CSV', 'ODS', 'PDF'],
  },
  xlsx: {
    ext: 'xlsx',
    label: 'Excel Workbook (.xlsx)',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    category: 'spreadsheets',
    workspace: 'spreadsheet',
    tier: 'Full Edit',
    notes: 'Multi-sheet grid editing, formulas, cell formatting, sorting, filtering, charts, and XLSX/CSV export.',
    canExportAs: ['XLSX', 'CSV', 'ODS', 'PDF'],
  },
  csv: {
    ext: 'csv',
    label: 'Comma-Separated (.csv)',
    mimeTypes: ['text/csv'],
    category: 'spreadsheets',
    workspace: 'spreadsheet',
    tier: 'Full Edit',
    notes: 'Edit tabular data with formulas, sorting, filtering, and export as CSV or XLSX.',
    canExportAs: ['CSV', 'XLSX', 'PDF'],
  },
  ods: {
    ext: 'ods',
    label: 'OpenDocument Sheet (.ods)',
    mimeTypes: ['application/vnd.oasis.opendocument.spreadsheet'],
    category: 'spreadsheets',
    workspace: 'spreadsheet',
    tier: 'Full Edit',
    notes: 'Import and edit worksheets, formulas, and tables, and export to ODS, XLSX, or CSV.',
    canExportAs: ['ODS', 'XLSX', 'CSV', 'PDF'],
  },
  ppt: {
    ext: 'ppt',
    label: 'Legacy PowerPoint (.ppt)',
    mimeTypes: ['application/vnd.ms-powerpoint'],
    category: 'presentations',
    workspace: 'presentation',
    tier: 'Extract & Edit',
    notes: 'Extracts text slides from legacy binary .ppt files into the slide editor for modern PPTX/PDF export.',
    canExportAs: ['PPTX', 'PDF'],
  },
  pptx: {
    ext: 'pptx',
    label: 'PowerPoint (.pptx)',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    category: 'presentations',
    workspace: 'presentation',
    tier: 'Full Edit',
    notes: 'Import slide text and shapes, edit layouts, backgrounds, transitions, present fullscreen, and export PPTX/PDF.',
    canExportAs: ['PPTX', 'PDF'],
  },
  odp: {
    ext: 'odp',
    label: 'OpenDocument Slides (.odp)',
    mimeTypes: ['application/vnd.oasis.opendocument.presentation'],
    category: 'presentations',
    workspace: 'presentation',
    tier: 'Extract & Edit',
    notes: 'Extracts slide text from ODP archives into the presentation editor and exports to PPTX or PDF.',
    canExportAs: ['PPTX', 'PDF'],
  },
  png: {
    ext: 'png',
    label: 'PNG Image',
    mimeTypes: ['image/png'],
    category: 'images',
    workspace: 'image',
    tier: 'Full Edit',
    notes: 'View, resize, crop, rotate, adjust, convert format, or export to PDF.',
    canExportAs: ['PNG', 'JPG', 'WEBP', 'PDF'],
  },
  jpg: {
    ext: 'jpg',
    label: 'JPEG Image',
    mimeTypes: ['image/jpeg'],
    category: 'images',
    workspace: 'image',
    tier: 'Full Edit',
    notes: 'View, resize, crop, rotate, compress, convert format, or export to PDF.',
    canExportAs: ['JPG', 'PNG', 'WEBP', 'PDF'],
  },
  jpeg: {
    ext: 'jpeg',
    label: 'JPEG Image',
    mimeTypes: ['image/jpeg'],
    category: 'images',
    workspace: 'image',
    tier: 'Full Edit',
    notes: 'View, resize, crop, rotate, compress, convert format, or export to PDF.',
    canExportAs: ['JPG', 'PNG', 'WEBP', 'PDF'],
  },
  webp: {
    ext: 'webp',
    label: 'WebP Image',
    mimeTypes: ['image/webp'],
    category: 'images',
    workspace: 'image',
    tier: 'Full Edit',
    notes: 'View, resize, crop, rotate, compress, convert format, or export to PDF.',
    canExportAs: ['WEBP', 'PNG', 'JPG', 'PDF'],
  },
  gif: {
    ext: 'gif',
    label: 'GIF Image',
    mimeTypes: ['image/gif'],
    category: 'images',
    workspace: 'image',
    tier: 'Full Edit',
    notes: 'View GIF and process still frames (resize, crop, rotate, convert to PNG/JPG/WEBP/PDF).',
    canExportAs: ['PNG', 'JPG', 'WEBP', 'PDF'],
  },
  svg: {
    ext: 'svg',
    label: 'SVG Vector',
    mimeTypes: ['image/svg+xml'],
    category: 'images',
    workspace: 'image',
    tier: 'Full Edit',
    notes: 'Render vector graphic, edit dimensions/crop, or convert to raster PNG/JPG/WEBP/PDF.',
    canExportAs: ['SVG', 'PNG', 'JPG', 'WEBP', 'PDF'],
  },
  html: {
    ext: 'html',
    label: 'HTML Document',
    mimeTypes: ['text/html'],
    category: 'other',
    workspace: 'code',
    tier: 'Full Edit',
    notes: 'Edit HTML markup with live rendered preview and convert cleanly to PDF.',
    canExportAs: ['HTML', 'PDF', 'TXT'],
  },
  json: {
    ext: 'json',
    label: 'JSON Data',
    mimeTypes: ['application/json'],
    category: 'other',
    workspace: 'code',
    tier: 'Full Edit',
    notes: 'Edit, format, validate, and minify JSON data or export as PDF.',
    canExportAs: ['JSON', 'TXT', 'PDF'],
  },
  xml: {
    ext: 'xml',
    label: 'XML Document',
    mimeTypes: ['application/xml', 'text/xml'],
    category: 'other',
    workspace: 'code',
    tier: 'Full Edit',
    notes: 'Edit and format XML documents or export as PDF.',
    canExportAs: ['XML', 'TXT', 'PDF'],
  },
};

export interface StoredDocument {
  id: string;
  name: string;
  ext: string;
  size: number;
  workspace: WorkspaceKind;
  category: FormatCategory;
  lastModified: number;
  createdAt: number;
  starred?: boolean;
  /** Original immutable file bytes preserved for safety */
  originalData: ArrayBuffer;
  /** Working draft data (bytes or serialized JSON state depending on editor) */
  workingDraft?: string | ArrayBuffer;
  /** Optional serialized editor state (e.g., PDF annotations JSON, slides JSON) */
  editorState?: string;
}

export type ConversionId =
  | 'pdf-to-docx'
  | 'docx-to-pdf'
  | 'pdf-to-images'
  | 'images-to-pdf'
  | 'xlsx-to-csv'
  | 'csv-to-xlsx'
  | 'pptx-to-pdf'
  | 'html-to-pdf'
  | 'txt-to-pdf';

export type AppView = 'home' | 'dashboard' | 'convert' | 'editor';

export interface NotificationToast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
}
