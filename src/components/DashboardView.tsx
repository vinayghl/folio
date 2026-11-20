import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  FileCode2,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Plus,
  Presentation,
  Star,
  Upload,
} from 'lucide-react';
import { ConversionId, FormatCategory, StoredDocument } from '../types/workspace';
import { formatBytes, formatRelativeDate, getLocalStorageEstimate } from '../lib/storage';
import { DocumentLibrary } from './DocumentLibrary';
import { PdfInitialAction, ToolsCatalog } from './ToolsCatalog';

interface DashboardViewProps {
  docs: StoredDocument[];
  onUploadFiles: (files: FileList | null, pdfAction?: PdfInitialAction) => Promise<void>;
  onOpenDoc: (doc: StoredDocument) => void;
  onRenameDoc: (id: string, newName: string) => Promise<void>;
  onToggleStarDoc: (id: string) => Promise<void>;
  onDeleteDoc: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onCreateNew: (kind: 'word' | 'spreadsheet' | 'presentation' | 'pdf' | 'txt' | 'html' | 'json') => Promise<void>;
  onGoToConvert: (recipeId?: ConversionId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  docs,
  onUploadFiles,
  onOpenDoc,
  onRenameDoc,
  onToggleStarDoc,
  onDeleteDoc,
  onClearAll,
  onCreateNew,
  onGoToConvert,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | FormatCategory>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [storageQuota, setStorageQuota] = useState<{ usage: number; quota: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const allDocsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getLocalStorageEstimate().then(setStorageQuota);
  }, [docs.length]);

  const starredDocs = useMemo(() => docs.filter((d) => d.starred), [docs]);
  const recentTop = useMemo(() => docs.slice(0, 4), [docs]);

  const categoryCounts = useMemo(() => {
    const counts: Record<FormatCategory, number> = {
      documents: 0,
      spreadsheets: 0,
      presentations: 0,
      images: 0,
      other: 0,
    };
    docs.forEach((d) => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [docs]);

  const usagePercent =
    storageQuota && storageQuota.quota > 0
      ? Math.min(100, Math.max(1, Math.round((storageQuota.usage / storageQuota.quota) * 100)))
      : 0;

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Workspace Dashboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage your browser-cached documents, starred files, and editing tools in one place.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onGoToConvert()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Convert Files</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              onUploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              title: 'New Word Doc',
              meta: 'DOCX Rich Editor',
              icon: FileText,
              color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50',
              onClick: () => onCreateNew('word'),
            },
            {
              title: 'New Spreadsheet',
              meta: 'XLSX Grid & Charts',
              icon: FileSpreadsheet,
              color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
              onClick: () => onCreateNew('spreadsheet'),
            },
            {
              title: 'New Slides',
              meta: 'PPTX Presentation',
              icon: Presentation,
              color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
              onClick: () => onCreateNew('presentation'),
            },
            {
              title: 'Blank PDF',
              meta: 'PDF Annotator',
              icon: FileText,
              color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
              onClick: () => onCreateNew('pdf'),
            },
            {
              title: 'HTML / Code',
              meta: 'Live Preview',
              icon: FileCode2,
              color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50',
              onClick: () => onCreateNew('html'),
            },
            {
              title: 'Upload Any File',
              meta: 'Open from device',
              icon: Plus,
              color: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
              onClick: () => fileInputRef.current?.click(),
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-blue-500/70 dark:hover:border-blue-500/70 transition-all cursor-pointer group"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {item.title}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.meta}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recently Opened + Starred Files */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recently Opened Documents */}
        <section className="lg:col-span-7 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Recently Opened Documents
          </h2>
          {recentTop.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-xs text-slate-500 dark:text-slate-400">
              Your recently opened documents will appear here as soon as you upload or create one.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentTop.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onOpenDoc(doc)}
                  className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-blue-500/70 transition-colors cursor-pointer flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {doc.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {doc.ext.toUpperCase()} · {formatBytes(doc.size)} · {formatRelativeDate(doc.lastModified)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStarDoc(doc.id);
                    }}
                    title={doc.starred ? 'Unstar' : 'Star'}
                    className={`p-1 rounded cursor-pointer shrink-0 ${
                      doc.starred ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${doc.starred ? 'fill-current' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Starred Files */}
        <section className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Starred Files</h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">{starredDocs.length}</span>
          </div>
          {starredDocs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-xs text-slate-500 dark:text-slate-400">
              Click the star icon on any file to pin important documents here for one-click access.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80">
              {starredDocs.slice(0, 4).map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onOpenDoc(doc)}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {doc.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {doc.ext.toUpperCase()} · {formatBytes(doc.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStarDoc(doc.id);
                    }}
                    className="p-1 text-amber-500 cursor-pointer shrink-0"
                    title="Unstar"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Document Categories */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Document Categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            {
              id: 'documents' as const,
              label: 'Documents',
              sub: 'PDF, DOCX, ODT, RTF, TXT',
              icon: FileText,
              color: 'text-blue-600 dark:text-blue-400',
            },
            {
              id: 'spreadsheets' as const,
              label: 'Spreadsheets',
              sub: 'XLSX, XLS, CSV, ODS',
              icon: FileSpreadsheet,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              id: 'presentations' as const,
              label: 'Presentations',
              sub: 'PPTX, PPT, ODP',
              icon: Presentation,
              color: 'text-amber-600 dark:text-amber-400',
            },
            {
              id: 'images' as const,
              label: 'Images',
              sub: 'PNG, JPG, WEBP, GIF, SVG',
              icon: ImageIcon,
              color: 'text-violet-600 dark:text-violet-400',
            },
            {
              id: 'other' as const,
              label: 'Code & Web',
              sub: 'HTML, JSON, XML',
              icon: FileCode2,
              color: 'text-slate-600 dark:text-slate-300',
            },
          ].map((cat) => {
            const Icon = cat.icon;
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(active ? 'all' : cat.id);
                  allDocsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50/40 dark:bg-blue-950/30 border-blue-600'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-4 h-4 ${cat.color}`} />
                  <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
                    {categoryCounts[cat.id]}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cat.label}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{cat.sub}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* All Documents Library */}
      <section ref={allDocsRef}>
        <DocumentLibrary
          docs={docs}
          title="All Documents"
          defaultViewMode="table"
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          onOpenDoc={onOpenDoc}
          onRenameDoc={onRenameDoc}
          onToggleStarDoc={onToggleStarDoc}
          onDeleteDoc={onDeleteDoc}
          onTriggerUpload={() => fileInputRef.current?.click()}
          onCreateSample={(kind) => onCreateNew(kind)}
        />
      </section>

      {/* Available Tools */}
      <section>
        <ToolsCatalog
          recentDocs={docs}
          compact
          onCreateNew={onCreateNew}
          onUploadAccepted={onUploadFiles}
          onOpenConvert={(recipeId) => onGoToConvert(recipeId)}
        />
      </section>

      {/* Local Browser Storage Information */}
      <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Local Browser Storage (IndexedDB)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
                Documents and drafts are stored strictly on your device in this browser&apos;s IndexedDB cache. Clearing browser data or closing Private/Incognito windows removes cached files—always export finished files to disk.
              </p>
            </div>
          </div>

          {docs.length > 0 && (
            <div className="shrink-0">
              {confirmClear ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearAll();
                      setConfirmClear(false);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white cursor-pointer"
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Clear Local Data
                </button>
              )}
            </div>
          )}
        </div>

        {storageQuota && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>Used: {formatBytes(storageQuota.usage)}</span>
              <span>Browser Quota: {formatBytes(storageQuota.quota)}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
