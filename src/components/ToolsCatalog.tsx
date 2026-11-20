import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowRightLeft,
  Crop,
  Eye,
  FileCheck2,
  FileDown,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileType,
  Layers,
  Minimize2,
  PenTool,
  Presentation,
  Scissors,
  SlidersHorizontal,
  Table2,
  Type,
} from 'lucide-react';
import { ConversionId, StoredDocument } from '../types/workspace';

export type PdfInitialAction = 'signature' | 'split' | 'compress' | 'organize';

interface ToolsCatalogProps {
  recentDocs: StoredDocument[];
  onCreateNew: (kind: 'word' | 'spreadsheet' | 'presentation' | 'pdf' | 'txt' | 'html' | 'json') => Promise<void>;
  onUploadAccepted: (files: FileList | null, pdfAction?: PdfInitialAction) => Promise<void>;
  onOpenConvert: (recipeId?: ConversionId) => void;
  compact?: boolean;
}

type ToolCategoryKey = 'all' | 'pdf' | 'documents' | 'spreadsheets' | 'presentations' | 'images';

interface ToolCardItem {
  id: string;
  category: Exclude<ToolCategoryKey, 'all'>;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  action: () => void;
}

export const ToolsCatalog: React.FC<ToolsCatalogProps> = ({
  onCreateNew,
  onUploadAccepted,
  onOpenConvert,
  compact = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<ToolCategoryKey>('all');
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const pendingPdfActionRef = useRef<PdfInitialAction | undefined>(undefined);

  const openFilePicker = (accept: string, pdfAction?: PdfInitialAction) => {
    pendingPdfActionRef.current = pdfAction;
    if (pickerRef.current) {
      pickerRef.current.accept = accept;
      pickerRef.current.value = '';
      pickerRef.current.click();
    }
  };

  const tools: ToolCardItem[] = [
    // PDF Tools
    {
      id: 'pdf-viewer',
      category: 'pdf',
      title: 'PDF Viewer',
      description: 'Open, zoom, search, and copy text from any PDF.',
      icon: Eye,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      action: () => openFilePicker('.pdf,application/pdf'),
    },
    {
      id: 'pdf-editor',
      category: 'pdf',
      title: 'PDF Editor',
      description: 'Highlight, add text boxes, draw, comment, and export.',
      icon: FileText,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      action: () => onCreateNew('pdf'),
    },
    {
      id: 'merge-pdf',
      category: 'pdf',
      title: 'Merge PDF',
      description: 'Combine multiple PDF documents into one file.',
      icon: FilePlus2,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      action: () => openFilePicker('.pdf,application/pdf', 'organize'),
    },
    {
      id: 'split-pdf',
      category: 'pdf',
      title: 'Split PDF',
      description: 'Split into smaller files or extract page ranges.',
      icon: Scissors,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      action: () => openFilePicker('.pdf,application/pdf', 'split'),
    },
    {
      id: 'compress-pdf',
      category: 'pdf',
      title: 'Compress PDF',
      description: 'Optimize PDF structure or reduce scan file size.',
      icon: Minimize2,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      action: () => openFilePicker('.pdf,application/pdf', 'compress'),
    },
    {
      id: 'pdf-to-word',
      category: 'pdf',
      title: 'PDF to Word',
      description: 'Extract PDF text streams into an editable DOCX.',
      icon: FileType,
      accentClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50',
      action: () => onOpenConvert('pdf-to-docx'),
    },
    {
      id: 'word-to-pdf',
      category: 'pdf',
      title: 'Word to PDF',
      description: 'Convert DOCX documents to paginated A4 PDFs.',
      icon: FileDown,
      accentClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50',
      action: () => onOpenConvert('docx-to-pdf'),
    },
    {
      id: 'image-to-pdf',
      category: 'pdf',
      title: 'Image to PDF',
      description: 'Combine PNG, JPG, WEBP, or SVG into one PDF.',
      icon: FileImage,
      accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
      action: () => onOpenConvert('images-to-pdf'),
    },
    {
      id: 'pdf-to-image',
      category: 'pdf',
      title: 'PDF to Image',
      description: 'Render PDF pages into high-resolution PNG or JPG.',
      icon: Layers,
      accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
      action: () => onOpenConvert('pdf-to-images'),
    },
    {
      id: 'sign-pdf',
      category: 'pdf',
      title: 'Sign PDF',
      description: 'Draw or type your signature and place it on any page.',
      icon: PenTool,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      action: () => openFilePicker('.pdf,application/pdf', 'signature'),
    },

    // Documents
    {
      id: 'word-editor',
      category: 'documents',
      title: 'Word Editor',
      description: 'Write rich documents with tables, images, and headings.',
      icon: FileText,
      accentClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50',
      action: () => onCreateNew('word'),
    },
    {
      id: 'docx-viewer',
      category: 'documents',
      title: 'DOCX Viewer',
      description: 'Open DOCX, ODT, RTF, or DOC files in the browser.',
      icon: FileCheck2,
      accentClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50',
      action: () => openFilePicker('.docx,.doc,.odt,.rtf'),
    },
    {
      id: 'txt-editor',
      category: 'documents',
      title: 'TXT Editor',
      description: 'Edit plain text, JSON, XML, or HTML with PDF export.',
      icon: Type,
      accentClass: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
      action: () => onCreateNew('txt'),
    },
    {
      id: 'doc-converter',
      category: 'documents',
      title: 'Document Converter',
      description: 'Convert between PDF, DOCX, HTML, and plain text.',
      icon: ArrowRightLeft,
      accentClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50',
      action: () => onOpenConvert('docx-to-pdf'),
    },

    // Spreadsheets
    {
      id: 'sheet-editor',
      category: 'spreadsheets',
      title: 'Spreadsheet Editor',
      description: 'Create multi-sheet workbooks with formulas and charts.',
      icon: FileSpreadsheet,
      accentClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
      action: () => onCreateNew('spreadsheet'),
    },
    {
      id: 'xlsx-viewer',
      category: 'spreadsheets',
      title: 'XLSX Viewer',
      description: 'Inspect and edit XLSX, XLS, and ODS spreadsheets.',
      icon: Table2,
      accentClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
      action: () => openFilePicker('.xlsx,.xls,.ods,.csv'),
    },
    {
      id: 'csv-editor',
      category: 'spreadsheets',
      title: 'CSV Editor',
      description: 'Edit CSV tables, sort columns, filter rows, and export.',
      icon: Table2,
      accentClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
      action: () => openFilePicker('.csv,text/csv'),
    },
    {
      id: 'excel-to-csv',
      category: 'spreadsheets',
      title: 'Excel to CSV',
      description: 'Export any XLSX or ODS worksheet to UTF-8 CSV.',
      icon: ArrowRightLeft,
      accentClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
      action: () => onOpenConvert('xlsx-to-csv'),
    },

    // Presentations
    {
      id: 'pptx-editor',
      category: 'presentations',
      title: 'Presentation Editor',
      description: 'Edit slides, layouts, shapes, backgrounds, and present.',
      icon: Presentation,
      accentClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
      action: () => onCreateNew('presentation'),
    },
    {
      id: 'pptx-viewer',
      category: 'presentations',
      title: 'PPTX Viewer',
      description: 'Open PPTX, ODP, and PPT slide decks locally.',
      icon: Eye,
      accentClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
      action: () => openFilePicker('.pptx,.odp,.ppt'),
    },
    {
      id: 'create-slides',
      category: 'presentations',
      title: 'Create Slides',
      description: 'Start a fresh 16:9 slide deck with PPTX & PDF export.',
      icon: Presentation,
      accentClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
      action: () => onCreateNew('presentation'),
    },

    // Images
    {
      id: 'image-viewer',
      category: 'images',
      title: 'Image Viewer',
      description: 'Inspect PNG, JPG, WEBP, GIF, and SVG at full zoom.',
      icon: Eye,
      accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
      action: () => openFilePicker('image/*'),
    },
    {
      id: 'image-converter',
      category: 'images',
      title: 'Image Converter',
      description: 'Convert between PNG, JPEG, WebP, and single-page PDF.',
      icon: ArrowRightLeft,
      accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
      action: () => openFilePicker('image/*'),
    },
    {
      id: 'image-compressor',
      category: 'images',
      title: 'Image Compressor',
      description: 'Adjust quality slider with live estimated output size.',
      icon: SlidersHorizontal,
      accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
      action: () => openFilePicker('image/*'),
    },
    {
      id: 'image-resizer',
      category: 'images',
      title: 'Image Resizer',
      description: 'Resize dimensions with aspect-ratio lock and crop.',
      icon: Crop,
      accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
      action: () => openFilePicker('image/*'),
    },
  ];

  const categories: Array<{ id: ToolCategoryKey; label: string; count: number }> = [
    { id: 'all', label: 'All Tools', count: tools.length },
    { id: 'pdf', label: 'PDF', count: tools.filter((t) => t.category === 'pdf').length },
    { id: 'documents', label: 'Documents', count: tools.filter((t) => t.category === 'documents').length },
    { id: 'spreadsheets', label: 'Spreadsheets', count: tools.filter((t) => t.category === 'spreadsheets').length },
    { id: 'presentations', label: 'Presentations', count: tools.filter((t) => t.category === 'presentations').length },
    { id: 'images', label: 'Images', count: tools.filter((t) => t.category === 'images').length },
  ];

  const visibleTools =
    activeCategory === 'all' ? tools : tools.filter((t) => t.category === activeCategory);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className={compact ? 'text-lg font-semibold' : 'text-xl sm:text-2xl font-bold tracking-tight'}>
            All Workspace Tools
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Direct browser-based tools for editing, organizing, and converting every supported format.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg overflow-x-auto max-w-full">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {cat.label}
              <span className="ml-1 text-[11px] text-slate-400 tabular-nums">{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={tool.action}
              className="group text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-blue-500/70 dark:hover:border-blue-500/70 hover:shadow-sm transition-all duration-150 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tool.accentClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {tool.title}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2">
                  {tool.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <input
        ref={pickerRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          onUploadAccepted(e.target.files, pendingPdfActionRef.current);
          pendingPdfActionRef.current = undefined;
          e.target.value = '';
        }}
      />
    </div>
  );
};
