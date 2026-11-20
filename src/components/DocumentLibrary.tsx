import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Presentation,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { FormatCategory, StoredDocument } from '../types/workspace';
import { downloadBuffer, formatBytes, formatRelativeDate } from '../lib/storage';

interface DocumentLibraryProps {
  docs: StoredDocument[];
  title?: string;
  maxItems?: number;
  defaultViewMode?: 'table' | 'grid';
  categoryFilter?: 'all' | FormatCategory;
  onCategoryFilterChange?: (cat: 'all' | FormatCategory) => void;
  onOpenDoc: (doc: StoredDocument) => void;
  onRenameDoc: (id: string, newName: string) => Promise<void>;
  onToggleStarDoc: (id: string) => Promise<void>;
  onDeleteDoc: (id: string) => Promise<void>;
  onTriggerUpload: () => void;
  onCreateSample?: (kind: 'word' | 'spreadsheet' | 'presentation' | 'pdf') => Promise<void>;
}

type SortKey = 'recent' | 'name' | 'size' | 'format';

const FILTER_TABS: Array<{ id: 'all' | FormatCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'documents', label: 'Documents' },
  { id: 'spreadsheets', label: 'Spreadsheets' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'images', label: 'Images' },
  { id: 'other', label: 'Code & Web' },
];

const ImageThumb: React.FC<{ doc: StoredDocument }> = ({ doc }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };
    const buf = doc.workingDraft instanceof ArrayBuffer ? doc.workingDraft : doc.originalData;
    const blob = new Blob([buf], { type: mimeMap[doc.ext] || 'image/png' });
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [doc.id, doc.ext, doc.originalData, doc.workingDraft]);

  if (!url) return <ImageIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />;
  return (
    <img
      src={url}
      alt={doc.name}
      referrerPolicy="no-referrer"
      className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
    />
  );
};

export const DocumentLibrary: React.FC<DocumentLibraryProps> = ({
  docs,
  title = 'Recently Opened Files',
  maxItems,
  defaultViewMode = 'table',
  categoryFilter: controlledCategory,
  onCategoryFilterChange,
  onOpenDoc,
  onRenameDoc,
  onToggleStarDoc,
  onDeleteDoc,
  onTriggerUpload,
  onCreateSample,
}) => {
  const [query, setQuery] = useState('');
  const [internalCat, setInternalCat] = useState<'all' | FormatCategory>('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(defaultViewMode);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const activeCategory = controlledCategory ?? internalCat;
  const setActiveCategory = (cat: 'all' | FormatCategory) => {
    if (onCategoryFilterChange) onCategoryFilterChange(cat);
    else setInternalCat(cat);
  };

  const processedDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = docs.filter((d) => {
      if (activeCategory !== 'all' && d.category !== activeCategory) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.ext.toLowerCase().includes(q)) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.size - a.size;
      if (sortBy === 'format') return a.ext.localeCompare(b.ext);
      return b.lastModified - a.lastModified;
    });

    return typeof maxItems === 'number' ? sorted.slice(0, maxItems) : sorted;
  }, [docs, query, activeCategory, sortBy, maxItems]);

  const renderDocIcon = (doc: StoredDocument) => {
    if (doc.category === 'images') return <ImageThumb doc={doc} />;
    if (doc.ext === 'pdf') {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
      );
    }
    if (doc.category === 'spreadsheets') {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
      );
    }
    if (doc.category === 'presentations') {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Presentation className="w-4 h-4" />
        </div>
      );
    }
    if (doc.category === 'other') {
      return (
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
          <FileCode2 className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4" />
      </div>
    );
  };

  const commitRename = async (doc: StoredDocument) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (trimmed && trimmed !== doc.name) {
      await onRenameDoc(doc.id, trimmed);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono tabular-nums">
            {processedDocs.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          {/* Sort */}
          <div className="relative inline-flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort documents"
              className="pl-7 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 outline-none cursor-pointer"
            >
              <option value="recent">Last Opened</option>
              <option value="name">Name (A–Z)</option>
              <option value="size">File Size</option>
              <option value="format">Format</option>
            </select>
          </div>

          {/* Table / Grid Toggle */}
          <div className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`p-1.5 rounded-md cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Card grid view"
              className={`p-1.5 rounded-md cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg overflow-x-auto w-fit max-w-full">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCategory(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeCategory === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {processedDocs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <FolderOpen className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {docs.length === 0 ? 'No documents cached in this browser yet' : 'No matching documents'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {docs.length === 0
              ? 'Upload any PDF, Word, Excel, PowerPoint, image, or text file to start editing locally, or create a blank file.'
              : 'Try clearing your search filter or selecting All categories.'}
          </p>
          {docs.length === 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onTriggerUpload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>
              {onCreateSample && (
                <>
                  <button
                    type="button"
                    onClick={() => onCreateSample('word')}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    New Word Doc
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreateSample('spreadsheet')}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    New Sheet
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-visible shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                  <th className="py-2.5 px-4">File</th>
                  <th className="py-2.5 px-4 hidden sm:table-cell">Format</th>
                  <th className="py-2.5 px-4 text-right hidden md:table-cell">Size</th>
                  <th className="py-2.5 px-4 text-right">Last Opened</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {processedDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => {
                      if (renamingId !== doc.id) onOpenDoc(doc);
                    }}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {renderDocIcon(doc)}
                        <div className="min-w-0 flex-1">
                          {renamingId === doc.id ? (
                            <input
                              type="text"
                              value={renameDraft}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => commitRename(doc)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(doc);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              className="px-2 py-1 text-xs font-medium rounded border border-blue-500 bg-white dark:bg-slate-800 outline-none w-full max-w-[260px]"
                            />
                          ) : (
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[300px]">
                              {doc.name}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 sm:hidden tabular-nums">
                            {doc.ext.toUpperCase()} · {formatBytes(doc.size)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 font-mono uppercase hidden sm:table-cell whitespace-nowrap">
                      {doc.ext}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 hidden md:table-cell whitespace-nowrap">
                      {formatBytes(doc.size)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatRelativeDate(doc.lastModified)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div
                        className="inline-flex items-center gap-1 relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleStarDoc(doc.id)}
                          title={doc.starred ? 'Remove from Starred' : 'Star file'}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                            doc.starred
                              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                              : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${doc.starred ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDoc(doc)}
                          className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 cursor-pointer"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(doc.id);
                            setRenameDraft(doc.name);
                          }}
                          title="Rename file"
                          className="hidden sm:inline-flex p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteDoc(doc.id)}
                          title="Delete file"
                          className="hidden sm:inline-flex p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                          title="More options"
                          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {openMenuId === doc.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 top-8 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-40 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onOpenDoc(doc);
                                }}
                                className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                                <span>Open in Editor</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setRenamingId(doc.id);
                                  setRenameDraft(doc.name);
                                }}
                                className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  downloadBuffer(doc.originalData, doc.name, 'application/octet-stream');
                                }}
                                className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-400" />
                                <span>Download Original</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onDeleteDoc(doc.id);
                                }}
                                className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {processedDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => {
                if (renamingId !== doc.id) onOpenDoc(doc);
              }}
              className="group rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-blue-500/70 dark:hover:border-blue-500/70 transition-all cursor-pointer flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {renderDocIcon(doc)}
                  <div className="min-w-0 flex-1">
                    {renamingId === doc.id ? (
                      <input
                        type="text"
                        value={renameDraft}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => commitRename(doc)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(doc);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="px-2 py-1 text-xs font-medium rounded border border-blue-500 bg-white dark:bg-slate-800 outline-none w-full"
                      />
                    ) : (
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {doc.name}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {doc.ext.toUpperCase()} · {formatBytes(doc.size)} · {formatRelativeDate(doc.lastModified)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStarDoc(doc.id);
                  }}
                  title={doc.starred ? 'Remove from Starred' : 'Star file'}
                  className={`p-1 rounded-md cursor-pointer shrink-0 ${
                    doc.starred ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                  }`}
                >
                  <Star className={`w-4 h-4 ${doc.starred ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div
                className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onOpenDoc(doc)}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Open
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(doc.id);
                      setRenameDraft(doc.name);
                    }}
                    title="Rename"
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBuffer(doc.originalData, doc.name, 'application/octet-stream')}
                    title="Download original"
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDoc(doc.id)}
                    title="Delete"
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
