import { FORMAT_SPECS, FormatSpec, StoredDocument } from '../types/workspace';

const DB_NAME = 'folio_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB safe browser threshold

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('lastModified', 'lastModified', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open local IndexedDB storage'));
  });
}

export async function listStoredDocuments(): Promise<StoredDocument[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as StoredDocument[]) || [];
      items.sort((a, b) => b.lastModified - a.lastModified);
      resolve(items);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to load documents'));
  });
}

export async function getStoredDocument(id: string): Promise<StoredDocument | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredDocument | undefined);
    req.onerror = () => reject(req.error ?? new Error('Failed to load document'));
  });
}

export async function saveStoredDocument(doc: StoredDocument): Promise<{ persisted: boolean; error?: string }> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(doc);
      req.onsuccess = () => resolve({ persisted: true });
      req.onerror = () => {
        const errName = req.error?.name || '';
        const msg =
          errName === 'QuotaExceededError'
            ? 'Browser IndexedDB storage quota reached. Download your document to save a copy.'
            : req.error?.message || 'Browser blocked local IndexedDB storage.';
        resolve({ persisted: false, error: msg });
      };
    });
  } catch (err) {
    return {
      persisted: false,
      error: err instanceof Error ? err.message : 'IndexedDB unavailable in this browser session.',
    };
  }
}

export async function getLocalStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      return {
        usage: est.usage ?? 0,
        quota: est.quota ?? 0,
      };
    }
  } catch {
    // ignore unsupported environments
  }
  return null;
}

export async function deleteStoredDocument(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to delete document'));
  });
}

export async function clearAllStoredDocuments(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to clear local storage'));
  });
}

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export function getFormatSpec(ext: string): FormatSpec | undefined {
  return FORMAT_SPECS[ext.toLowerCase()];
}

export function validateUploadedFile(file: File): { valid: boolean; ext: string; spec?: FormatSpec; error?: string } {
  if (!file) {
    return { valid: false, ext: '', error: 'No file selected.' };
  }
  if (file.size === 0) {
    return { valid: false, ext: '', error: `"${file.name}" is empty (0 bytes).` };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      ext: '',
      error: `"${file.name}" exceeds the 150 MB browser processing limit (${formatBytes(file.size)}).`,
    };
  }
  const ext = getFileExtension(file.name);
  const spec = getFormatSpec(ext);
  if (!spec) {
    return {
      valid: false,
      ext,
      error: `Unsupported file format ".${ext || 'unknown'}". Supported: PDF, DOC/DOCX, TXT, RTF, ODT, XLS/XLSX/CSV/ODS, PPT/PPTX/ODP, PNG/JPG/WEBP/GIF/SVG, HTML, JSON, XML.`,
    };
  }
  return { valid: true, ext, spec };
}

export async function createStoredDocumentFromFile(file: File): Promise<StoredDocument> {
  const validation = validateUploadedFile(file);
  if (!validation.valid || !validation.spec) {
    throw new Error(validation.error || 'Unsupported file');
  }
  const buffer = await file.arrayBuffer();
  // Quick magic byte validation for PDFs
  if (validation.ext === 'pdf') {
    const header = new TextDecoder().decode(buffer.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      throw new Error(`"${file.name}" does not appear to be a valid PDF file (missing %PDF header).`);
    }
  }
  const now = Date.now();
  const doc: StoredDocument = {
    id: crypto.randomUUID ? crypto.randomUUID() : `doc_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    ext: validation.ext,
    size: file.size,
    workspace: validation.spec.workspace,
    category: validation.spec.category,
    lastModified: now,
    createdAt: now,
    originalData: buffer,
  };
  await saveStoredDocument(doc);
  return doc;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadBuffer(buffer: ArrayBuffer | Uint8Array, filename: string, mimeType: string): void {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(new Blob([copy], { type: mimeType }), filename);
}

export function replaceFileExtension(filename: string, newExt: string): string {
  const dotIdx = filename.lastIndexOf('.');
  const cleanExt = newExt.replace(/^\./, '');
  if (dotIdx <= 0) return `${filename}.${cleanExt}`;
  return `${filename.slice(0, dotIdx)}.${cleanExt}`;
}
