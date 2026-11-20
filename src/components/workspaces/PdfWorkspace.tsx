import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  FileDown,
  FilePlus2,
  Highlighter,
  ImagePlus,
  Layers,
  Loader2,
  MessageSquarePlus,
  Minimize2,
  MousePointer,
  PenTool,
  Pencil,
  RotateCw,
  Scissors,
  Search,
  Square,
  Trash2,
  Type,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { StoredDocument } from '../../types/workspace';
import { EditorShell, ExportOption } from '../EditorShell';
import {
  compressPdfBuffer,
  exportEditedPdf,
  extractPdfPages,
  extractTextFromPdf,
  mergePdfBuffers,
  parsePageRange,
  PdfAnnotation,
  pdfjsLib,
  PdfPageMeta,
  splitPdfIntoChunks,
} from '../../lib/pdfEngine';
import { pdfToDocxBytes, pdfToImages } from '../../lib/converters';
import { downloadBlob, downloadBuffer, formatBytes, replaceFileExtension } from '../../lib/storage';

interface PdfWorkspaceProps {
  doc: StoredDocument;
  onUpdateDoc: (updated: StoredDocument) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
  initialAction?: 'signature' | 'split' | 'compress' | 'organize';
}

type PdfTool = 'select' | 'highlight' | 'text' | 'comment' | 'draw' | 'shape' | 'signature';

interface TextSpanItem {
  str: string;
  left: number;
  top: number;
  fontSize: number;
  width: number;
}

export const PdfWorkspace: React.FC<PdfWorkspaceProps> = ({
  doc,
  onUpdateDoc,
  onBack,
  isDark,
  onToggleTheme,
  onNotify,
  initialAction,
}) => {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer>(doc.originalData);
  const [numPages, setNumPages] = useState(0);
  const [pagesMeta, setPagesMeta] = useState<PdfPageMeta[]>([]);
  const [currentPage, setCurrentPage] = useState(0); // index in pagesMeta
  const [zoom, setZoom] = useState(1.1);
  const [activeTool, setActiveTool] = useState<PdfTool>('select');
  const [shapeType, setShapeType] = useState<'rect' | 'ellipse' | 'line'>('rect');
  const [activeColor, setActiveColor] = useState('#2563eb');
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [history, setHistory] = useState<PdfAnnotation[][]>([]);
  const [redoStack, setRedoStack] = useState<PdfAnnotation[][]>([]);
  const [selectedAnnotId, setSelectedAnnotId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  const [loading, setLoading] = useState(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [textSpans, setTextSpans] = useState<TextSpanItem[]>([]);
  const [pageViewportSize, setPageViewportSize] = useState({ width: 612, height: 792 });

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageTexts, setPageTexts] = useState<Array<{ page: number; text: string }>>([]);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);

  // Modals / Drawers
  const [organizeOpen, setOrganizeOpen] = useState(initialAction === 'organize');
  const [selectedOrgPages, setSelectedOrgPages] = useState<Set<number>>(new Set());
  const [signatureModalOpen, setSignatureModalOpen] = useState(initialAction === 'signature');
  const [splitModalOpen, setSplitModalOpen] = useState(initialAction === 'split');
  const [compressModalOpen, setCompressModalOpen] = useState(initialAction === 'compress');
  const [splitChunkSize, setSplitChunkSize] = useState(1);
  const [extractRangeText, setExtractRangeText] = useState('1');
  const [compressMode, setCompressMode] = useState<'lossless' | 'balanced' | 'compact'>('balanced');
  const [compressProgress, setCompressProgress] = useState(0);

  // Interactive drawing state
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurr, setDragCurr] = useState<{ x: number; y: number } | null>(null);
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Signature pad
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigDrawingRef = useRef(false);
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
  const [typedSig, setTypedSig] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  // Load initial state from doc
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const activeBuffer =
          doc.workingDraft instanceof ArrayBuffer ? doc.workingDraft : doc.originalData;
        setPdfBytes(activeBuffer);

        const loadingTask = pdfjsLib.getDocument({ data: activeBuffer.slice(0) });
        const loadedPdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = loadedPdf;
        setNumPages(loadedPdf.numPages);

        // Restore saved annotations & page order if available
        let restoredPages: PdfPageMeta[] = Array.from({ length: loadedPdf.numPages }, (_, i) => ({
          originalIndex: i,
          rotation: 0,
        }));
        let restoredAnnots: PdfAnnotation[] = [];
        if (doc.editorState) {
          try {
            const parsed = JSON.parse(doc.editorState);
            if (Array.isArray(parsed.pagesMeta) && parsed.pagesMeta.length > 0) {
              restoredPages = parsed.pagesMeta.filter(
                (p: PdfPageMeta) => p.originalIndex >= 0 && p.originalIndex < loadedPdf.numPages
              );
            }
            if (Array.isArray(parsed.annotations)) {
              restoredAnnots = parsed.annotations;
            }
          } catch {
            // ignore corrupted editorState
          }
        }
        setPagesMeta(restoredPages);
        setAnnotations(restoredAnnots);
        setCurrentPage(0);

        // Generate low-res thumbnails asynchronously
        const thumbs: string[] = [];
        const thumbCount = Math.min(loadedPdf.numPages, 40);
        for (let i = 1; i <= thumbCount; i++) {
          if (cancelled) return;
          const p = await loadedPdf.getPage(i);
          const vp = p.getViewport({ scale: 0.24 });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width);
          c.height = Math.round(vp.height);
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          await p.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
          thumbs.push(c.toDataURL('image/jpeg', 0.72));
        }
        if (!cancelled) setThumbnails(thumbs);

        // Extract text in background for search
        extractTextFromPdf(activeBuffer).then((txt) => {
          if (!cancelled) setPageTexts(txt);
        }).catch(() => {});
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to parse PDF file.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  // Render active page onto main canvas
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const meta = pagesMeta[currentPage];
    if (!pdf || !meta || !canvasRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(meta.originalIndex + 1);
        const totalRotation = (page.rotate + meta.rotation) % 360;
        const baseViewport = page.getViewport({ scale: zoom, rotation: totalRotation });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: zoom * dpr, rotation: totalRotation });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.round(renderViewport.width);
        canvas.height = Math.round(renderViewport.height);
        canvas.style.width = `${Math.round(baseViewport.width)}px`;
        canvas.style.height = `${Math.round(baseViewport.height)}px`;

        setPageViewportSize({
          width: Math.round(baseViewport.width),
          height: Math.round(baseViewport.height),
        });

        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;

        // Build selectable text overlay spans
        const textContent = await page.getTextContent();
        if (cancelled) return;
        const spans: TextSpanItem[] = [];
        for (const item of textContent.items) {
          if ('str' in item && item.str.trim()) {
            const tx = pdfjsLib.Util.transform(baseViewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]) || 12 * zoom;
            spans.push({
              str: item.str,
              left: tx[4],
              top: tx[5] - fontHeight,
              fontSize: fontHeight,
              width: item.width * zoom,
            });
          }
        }
        setTextSpans(spans);
      } catch (err) {
        if (!cancelled) {
          onNotify('error', 'Render Error', err instanceof Error ? err.message : 'Failed to render page.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pagesMeta, currentPage, zoom, numPages]);

  // Persist editorState automatically
  const persistState = useCallback(
    async (nextPages: PdfPageMeta[], nextAnnots: PdfAnnotation[], nextBuffer?: ArrayBuffer) => {
      setSaveStatus('saving');
      try {
        const updated: StoredDocument = {
          ...doc,
          lastModified: Date.now(),
          workingDraft: nextBuffer ?? doc.workingDraft,
          editorState: JSON.stringify({ pagesMeta: nextPages, annotations: nextAnnots }),
        };
        await onUpdateDoc(updated);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    },
    [doc, onUpdateDoc]
  );

  const commitAnnotations = (next: PdfAnnotation[]) => {
    setHistory((h) => [...h.slice(-29), annotations]);
    setRedoStack([]);
    setAnnotations(next);
    persistState(pagesMeta, next);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [...r, annotations]);
    setHistory((h) => h.slice(0, -1));
    setAnnotations(prev);
    persistState(pagesMeta, prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((h) => [...h, annotations]);
    setRedoStack((r) => r.slice(0, -1));
    setAnnotations(next);
    persistState(pagesMeta, next);
  };

  // Search handler
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matchedIndices: number[] = [];
    pagesMeta.forEach((meta, idx) => {
      const pageEntry = pageTexts.find((p) => p.page === meta.originalIndex + 1);
      if (pageEntry && pageEntry.text.toLowerCase().includes(q)) {
        matchedIndices.push(idx);
      }
    });
    setSearchMatches(matchedIndices);
  }, [searchQuery, pageTexts, pagesMeta]);

  const getNormalizedCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'select') {
      if (e.target === overlayRef.current) setSelectedAnnotId(null);
      return;
    }
    const pt = getNormalizedCoords(e);

    if (activeTool === 'text') {
      const id = `txt_${Date.now()}`;
      const newAnnot: PdfAnnotation = {
        id,
        pageIndex: currentPage,
        type: 'text',
        x: pt.x,
        y: pt.y,
        text: 'Text note',
        fontSize: 14,
        color: activeColor,
      };
      commitAnnotations([...annotations, newAnnot]);
      setSelectedAnnotId(id);
      setEditingTextId(id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'comment') {
      const id = `cmt_${Date.now()}`;
      const newAnnot: PdfAnnotation = {
        id,
        pageIndex: currentPage,
        type: 'comment',
        x: pt.x,
        y: pt.y,
        author: 'Reviewer',
        text: 'Add comment...',
        color: '#d97706',
      };
      commitAnnotations([...annotations, newAnnot]);
      setSelectedAnnotId(id);
      setEditingTextId(id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'draw') {
      setDrawPoints([pt]);
      return;
    }

    if (activeTool === 'highlight' || activeTool === 'shape') {
      setDragStart(pt);
      setDragCurr(pt);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'draw' && drawPoints.length > 0) {
      const pt = getNormalizedCoords(e);
      setDrawPoints((pts) => [...pts, pt]);
      return;
    }
    if (dragStart) {
      setDragCurr(getNormalizedCoords(e));
    }
  };

  const handlePointerUp = () => {
    if (activeTool === 'draw' && drawPoints.length > 1) {
      const newAnnot: PdfAnnotation = {
        id: `draw_${Date.now()}`,
        pageIndex: currentPage,
        type: 'draw',
        points: drawPoints,
        color: activeColor,
        strokeWidth: 2.5,
      };
      commitAnnotations([...annotations, newAnnot]);
      setDrawPoints([]);
      return;
    }

    if (dragStart && dragCurr) {
      const x = Math.min(dragStart.x, dragCurr.x);
      const y = Math.min(dragStart.y, dragCurr.y);
      const width = Math.abs(dragCurr.x - dragStart.x);
      const height = Math.abs(dragCurr.y - dragStart.y);

      if (width > 0.01 && height > 0.01) {
        if (activeTool === 'highlight') {
          const newAnnot: PdfAnnotation = {
            id: `hl_${Date.now()}`,
            pageIndex: currentPage,
            type: 'highlight',
            x,
            y,
            width,
            height,
            color: '#facc15',
          };
          commitAnnotations([...annotations, newAnnot]);
        } else if (activeTool === 'shape') {
          const newAnnot: PdfAnnotation = {
            id: `shp_${Date.now()}`,
            pageIndex: currentPage,
            type: 'shape',
            shape: shapeType,
            x: shapeType === 'line' ? dragStart.x : x,
            y: shapeType === 'line' ? dragStart.y : y,
            width: shapeType === 'line' ? dragCurr.x - dragStart.x : width,
            height: shapeType === 'line' ? dragCurr.y - dragStart.y : height,
            color: activeColor,
            strokeWidth: 2,
          };
          commitAnnotations([...annotations, newAnnot]);
        }
      }
      setDragStart(null);
      setDragCurr(null);
    }
  };

  const handleInsertImageFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Convert any non-png/jpg (like webp) via canvas to PNG so pdf-lib always embeds cleanly
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        const pngUrl = c.toDataURL('image/png');
        const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
        const wNorm = 0.28;
        const hNorm = Math.min(0.45, wNorm * aspect * (pageViewportSize.width / pageViewportSize.height));
        const newAnnot: PdfAnnotation = {
          id: `img_${Date.now()}`,
          pageIndex: currentPage,
          type: 'image',
          x: 0.35,
          y: 0.3,
          width: wNorm,
          height: Math.max(0.08, hNorm),
          dataUrl: pngUrl,
        };
        commitAnnotations([...annotations, newAnnot]);
        setSelectedAnnotId(newAnnot.id);
        onNotify('success', 'Image inserted', 'Drag corners or reposition on the page.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Signature pad actions
  const clearSigCanvas = () => {
    const c = sigCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const insertSignature = () => {
    let pngUrl = '';
    if (sigMode === 'draw') {
      const c = sigCanvasRef.current;
      if (!c) return;
      pngUrl = c.toDataURL('image/png');
    } else {
      if (!typedSig.trim()) return;
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 140;
      const ctx = c.getContext('2d')!;
      ctx.font = 'italic 44px Georgia, serif';
      ctx.fillStyle = '#0f172a';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedSig.trim(), 20, 72);
      pngUrl = c.toDataURL('image/png');
    }

    const newAnnot: PdfAnnotation = {
      id: `sig_${Date.now()}`,
      pageIndex: currentPage,
      type: 'signature',
      x: 0.55,
      y: 0.72,
      width: 0.28,
      height: 0.085,
      dataUrl: pngUrl,
    };
    commitAnnotations([...annotations, newAnnot]);
    setSelectedAnnotId(newAnnot.id);
    setSignatureModalOpen(false);
    setTypedSig('');
    onNotify('success', 'Signature added', 'Placed on the current page.');
  };

  // Page manipulations
  const rotatePage = (idx: number, delta: number) => {
    const nextPages = pagesMeta.map((p, i) =>
      i === idx ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p
    );
    setPagesMeta(nextPages);
    persistState(nextPages, annotations);
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= pagesMeta.length) return;
    const nextPages = [...pagesMeta];
    const [item] = nextPages.splice(idx, 1);
    nextPages.splice(target, 0, item);

    // Remap annotation pageIndex values
    const nextAnnots = annotations.map((a) => {
      if (a.pageIndex === idx) return { ...a, pageIndex: target };
      if (a.pageIndex === target) return { ...a, pageIndex: idx };
      return a;
    });

    setPagesMeta(nextPages);
    setAnnotations(nextAnnots);
    if (currentPage === idx) setCurrentPage(target);
    persistState(nextPages, nextAnnots);
  };

  const deletePage = (idx: number) => {
    if (pagesMeta.length <= 1) {
      onNotify('warning', 'Cannot delete last page', 'A PDF must contain at least one page.');
      return;
    }
    const nextPages = pagesMeta.filter((_, i) => i !== idx);
    const nextAnnots = annotations
      .filter((a) => a.pageIndex !== idx)
      .map((a) => (a.pageIndex > idx ? { ...a, pageIndex: a.pageIndex - 1 } : a));
    setPagesMeta(nextPages);
    setAnnotations(nextAnnots);
    if (currentPage >= nextPages.length) setCurrentPage(nextPages.length - 1);
    persistState(nextPages, nextAnnots);
  };

  const handleMergeFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyMessage('Merging PDFs...');
    try {
      const currentExported = await exportEditedPdf(pdfBytes, pagesMeta, annotations);
      const buffers: ArrayBuffer[] = [
        currentExported.buffer.slice(
          currentExported.byteOffset,
          currentExported.byteOffset + currentExported.byteLength
        ) as ArrayBuffer,
      ];
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith('.pdf')) {
          throw new Error(`"${f.name}" is not a PDF file.`);
        }
        buffers.push(await f.arrayBuffer());
      }
      const mergedBytes = await mergePdfBuffers(buffers);
      const mergedBuf = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength
      ) as ArrayBuffer;

      // Reload PDF with merged buffer
      const loadedPdf = await pdfjsLib.getDocument({ data: mergedBuf.slice(0) }).promise;
      pdfDocRef.current = loadedPdf;
      const newPages: PdfPageMeta[] = Array.from({ length: loadedPdf.numPages }, (_, i) => ({
        originalIndex: i,
        rotation: 0,
      }));
      setPdfBytes(mergedBuf);
      setNumPages(loadedPdf.numPages);
      setPagesMeta(newPages);
      setAnnotations([]);
      setCurrentPage(0);
      await persistState(newPages, [], mergedBuf);
      onNotify('success', 'PDFs Merged', `Combined into ${loadedPdf.numPages} pages.`);
    } catch (err) {
      onNotify('error', 'Merge Failed', err instanceof Error ? err.message : 'Unable to merge PDFs.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleExtractSelected = async () => {
    try {
      const currentExported = await exportEditedPdf(pdfBytes, pagesMeta, annotations);
      const buf = currentExported.buffer.slice(
        currentExported.byteOffset,
        currentExported.byteOffset + currentExported.byteLength
      ) as ArrayBuffer;
      const pageList =
        selectedOrgPages.size > 0
          ? Array.from(selectedOrgPages).map((i) => i + 1).sort((a, b) => a - b)
          : parsePageRange(extractRangeText, pagesMeta.length);
      const extracted = await extractPdfPages(buf, pageList);
      downloadBuffer(extracted, replaceFileExtension(doc.name, 'extracted.pdf'), 'application/pdf');
      onNotify('success', 'Pages Extracted', `Exported ${pageList.length} page(s).`);
    } catch (err) {
      onNotify('error', 'Extract Failed', err instanceof Error ? err.message : 'Invalid page range.');
    }
  };

  const handleSplitPdf = async () => {
    setBusyMessage('Splitting PDF...');
    try {
      const currentExported = await exportEditedPdf(pdfBytes, pagesMeta, annotations);
      const buf = currentExported.buffer.slice(
        currentExported.byteOffset,
        currentExported.byteOffset + currentExported.byteLength
      ) as ArrayBuffer;
      const chunks = await splitPdfIntoChunks(buf, splitChunkSize);
      const baseName = doc.name.replace(/\.pdf$/i, '');
      chunks.forEach((chunk, idx) => {
        setTimeout(() => {
          downloadBuffer(chunk.bytes, `${baseName}_${chunk.label}.pdf`, 'application/pdf');
        }, idx * 250);
      });
      setSplitModalOpen(false);
      onNotify('success', 'PDF Split Complete', `Generated ${chunks.length} PDF file(s).`);
    } catch (err) {
      onNotify('error', 'Split Failed', err instanceof Error ? err.message : 'Failed to split PDF.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleCompressPdf = async () => {
    setBusyMessage('Compressing PDF...');
    setCompressProgress(0);
    try {
      const currentExported = await exportEditedPdf(pdfBytes, pagesMeta, annotations);
      const buf = currentExported.buffer.slice(
        currentExported.byteOffset,
        currentExported.byteOffset + currentExported.byteLength
      ) as ArrayBuffer;
      const compressed = await compressPdfBuffer(buf, compressMode, setCompressProgress);
      downloadBuffer(compressed, replaceFileExtension(doc.name, 'compressed.pdf'), 'application/pdf');
      setCompressModalOpen(false);
      onNotify(
        'success',
        'Compression Complete',
        `Original: ${formatBytes(buf.byteLength)} → Compressed: ${formatBytes(compressed.byteLength)}`
      );
    } catch (err) {
      onNotify('error', 'Compression Failed', err instanceof Error ? err.message : 'Unable to compress PDF.');
    } finally {
      setBusyMessage(null);
    }
  };

  const exportOptions: ExportOption[] = [
    {
      label: 'Download Edited PDF (.pdf)',
      description: 'Includes page rotations, reordering, and all annotations',
      onClick: async () => {
        setBusyMessage('Generating PDF...');
        try {
          const bytes = await exportEditedPdf(pdfBytes, pagesMeta, annotations);
          downloadBuffer(bytes, doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`, 'application/pdf');
          onNotify('success', 'PDF Exported', 'Your edited PDF has been downloaded.');
        } catch (err) {
          onNotify('error', 'Export Failed', err instanceof Error ? err.message : 'Failed to export PDF.');
        } finally {
          setBusyMessage(null);
        }
      },
    },
    {
      label: 'Convert to Word (.docx)',
      description: 'Extracts text paragraphs into an editable Word document',
      onClick: async () => {
        setBusyMessage('Converting PDF to DOCX...');
        try {
          const docxBuf = await pdfToDocxBytes(pdfBytes);
          downloadBuffer(
            docxBuf,
            replaceFileExtension(doc.name, 'docx'),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          );
          onNotify('success', 'DOCX Ready', 'Converted extracted PDF text to Word.');
        } catch (err) {
          onNotify('error', 'Conversion Failed', err instanceof Error ? err.message : 'Failed to convert.');
        } finally {
          setBusyMessage(null);
        }
      },
    },
    {
      label: 'Export Pages as PNG Images',
      description: 'High-resolution PNG render of each page',
      onClick: async () => {
        setBusyMessage('Rendering PNG images...');
        try {
          const imgs = await pdfToImages(pdfBytes, 'png', 2);
          const base = doc.name.replace(/\.pdf$/i, '');
          imgs.forEach((im, i) => {
            setTimeout(() => downloadBlob(im.blob, `${base}_page_${im.page}.png`), i * 200);
          });
          onNotify('success', 'Images Exported', `Exported ${imgs.length} PNG file(s).`);
        } finally {
          setBusyMessage(null);
        }
      },
    },
    {
      label: 'Export Plain Text (.txt)',
      description: 'Extracts selectable text content',
      onClick: async () => {
        const pages = await extractTextFromPdf(pdfBytes);
        const text = pages.map((p) => `--- Page ${p.page} ---\n${p.text}`).join('\n\n');
        downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), replaceFileExtension(doc.name, 'txt'));
      },
    },
  ];

  const currentAnnots = annotations.filter((a) => a.pageIndex === currentPage);

  const toolbar = (
    <div className="flex items-center gap-1.5 min-w-max">
      <button
        type="button"
        onClick={() => setActiveTool('select')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
          activeTool === 'select'
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <MousePointer className="w-3.5 h-3.5" />
        <span>Select</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTool('highlight')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
          activeTool === 'highlight'
            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Highlighter className="w-3.5 h-3.5" />
        <span>Highlight</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTool('text')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
          activeTool === 'text'
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Type className="w-3.5 h-3.5" />
        <span>Text Box</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTool('comment')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
          activeTool === 'comment'
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <MessageSquarePlus className="w-3.5 h-3.5" />
        <span>Comment</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTool('draw')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
          activeTool === 'draw'
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Pencil className="w-3.5 h-3.5" />
        <span>Draw</span>
      </button>

      <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setShapeType('rect');
            setActiveTool('shape');
          }}
          title="Rectangle"
          className={`p-1.5 cursor-pointer ${
            activeTool === 'shape' && shapeType === 'rect'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setShapeType('ellipse');
            setActiveTool('shape');
          }}
          title="Ellipse"
          className={`p-1.5 cursor-pointer ${
            activeTool === 'shape' && shapeType === 'ellipse'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Circle className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setShapeType('line');
            setActiveTool('shape');
          }}
          title="Line"
          className={`p-1.5 cursor-pointer ${
            activeTool === 'shape' && shapeType === 'line'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>

      <label className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
        <span className="w-3.5 h-3.5 rounded-sm border border-slate-300 dark:border-slate-600" style={{ backgroundColor: activeColor }} />
        <input
          type="color"
          value={activeColor}
          onChange={(e) => setActiveColor(e.target.value)}
          className="sr-only"
          aria-label="Annotation color"
        />
      </label>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
      >
        <ImagePlus className="w-3.5 h-3.5" />
        <span>Image</span>
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleInsertImageFile(f);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => setSignatureModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
      >
        <PenTool className="w-3.5 h-3.5" />
        <span>Signature</span>
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      <button
        type="button"
        onClick={() => rotatePage(currentPage, 90)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
      >
        <RotateCw className="w-3.5 h-3.5" />
        <span>Rotate</span>
      </button>

      <button
        type="button"
        onClick={() => setOrganizeOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
          organizeOpen
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        <span>Organize</span>
      </button>

      <button
        type="button"
        onClick={() => mergeInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
      >
        <FilePlus2 className="w-3.5 h-3.5" />
        <span>Merge</span>
      </button>
      <input
        ref={mergeInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleMergeFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => setSplitModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
      >
        <Scissors className="w-3.5 h-3.5" />
        <span>Split</span>
      </button>

      <button
        type="button"
        onClick={() => setCompressModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
      >
        <Minimize2 className="w-3.5 h-3.5" />
        <span>Compress</span>
      </button>

      <button
        type="button"
        onClick={() => setSearchOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
          searchOpen
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Find</span>
      </button>
    </div>
  );

  const sidebar = (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
        <span>Pages ({pagesMeta.length})</span>
        <span className="tabular-nums">
          {currentPage + 1} / {pagesMeta.length || 1}
        </span>
      </div>
      <div className="space-y-2">
        {pagesMeta.map((meta, idx) => {
          const thumb = thumbnails[meta.originalIndex];
          const isActive = idx === currentPage;
          const isMatch = searchMatches.includes(idx);
          return (
            <div
              key={`${meta.originalIndex}_${idx}`}
              onClick={() => {
                setCurrentPage(idx);
                setOrganizeOpen(false);
              }}
              className={`group rounded-lg p-2 border transition-colors cursor-pointer ${
                isActive
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                  : isMatch
                  ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="aspect-[3/4] bg-white rounded overflow-hidden border border-slate-200/80 dark:border-slate-700 flex items-center justify-center">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`Page ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    style={{ transform: `rotate(${meta.rotation}deg)` }}
                    className="max-w-full max-h-full object-contain transition-transform"
                  />
                ) : (
                  <span className="text-xs text-slate-400 tabular-nums">Page {idx + 1}</span>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="tabular-nums font-medium">Page {idx + 1}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      movePage(idx, -1);
                    }}
                    disabled={idx === 0}
                    title="Move up"
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      movePage(idx, 1);
                    }}
                    disabled={idx === pagesMeta.length - 1}
                    title="Move down"
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(idx);
                    }}
                    title="Delete page"
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <EditorShell
      title={doc.name}
      formatLabel="PDF Document"
      onRename={(newName) => onUpdateDoc({ ...doc, name: newName, lastModified: Date.now() })}
      onBack={onBack}
      saveStatus={saveStatus}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      canUndo={history.length > 0}
      canRedo={redoStack.length > 0}
      onUndo={handleUndo}
      onRedo={handleRedo}
      zoom={zoom}
      onZoomIn={() => setZoom((z) => Math.min(2.4, +(z + 0.15).toFixed(2)))}
      onZoomOut={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
      onResetOriginal={() => {
        setAnnotations([]);
        setPdfBytes(doc.originalData);
        const resetPages = Array.from({ length: numPages }, (_, i) => ({
          originalIndex: i,
          rotation: 0,
        }));
        setPagesMeta(resetPages);
        persistState(resetPages, [], doc.originalData);
        onNotify('info', 'Reverted', 'Restored original PDF file.');
      }}
      exportOptions={exportOptions}
      toolbar={toolbar}
      sidebar={sidebar}
      sidebarTitle="Pages"
    >
      {/* Search Bar */}
      {searchOpen && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search text across all PDF pages..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          {searchQuery.trim() && (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="tabular-nums">
                {searchMatches.length} matching page{searchMatches.length === 1 ? '' : 's'}
              </span>
              {searchMatches.map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentPage(idx)}
                  className={`px-2 py-0.5 rounded border text-xs tabular-nums cursor-pointer ${
                    currentPage === idx
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  P.{idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Busy Banner */}
      {busyMessage && (
        <div className="bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-900 px-4 py-2 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{busyMessage}</span>
        </div>
      )}

      {/* Loading / Error */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-96 gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-sm">Rendering PDF document locally...</p>
        </div>
      ) : errorMsg ? (
        <div className="max-w-lg mx-auto my-12 p-6 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-xl">
          <h3 className="text-base font-semibold text-red-600 dark:text-red-400">Unable to open PDF</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{errorMsg}</p>
        </div>
      ) : organizeOpen ? (
        /* Organize Pages Grid */
        <div className="p-6 max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-semibold">Organize & Extract Pages</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select pages to extract, or rotate, reorder, and delete individual pages.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExtractSelected}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>
                  Extract {selectedOrgPages.size > 0 ? `(${selectedOrgPages.size})` : 'Range'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOrganizeOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
              >
                Done Organizing
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {pagesMeta.map((meta, idx) => {
              const selected = selectedOrgPages.has(idx);
              const thumb = thumbnails[meta.originalIndex];
              return (
                <div
                  key={`${meta.originalIndex}_${idx}`}
                  className={`rounded-xl border p-3 bg-white dark:bg-slate-900 transition-colors ${
                    selected ? 'border-blue-600 ring-2 ring-blue-600/20' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div
                    onClick={() => {
                      const next = new Set(selectedOrgPages);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      setSelectedOrgPages(next);
                    }}
                    className="aspect-[3/4] bg-slate-50 dark:bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer relative border border-slate-100 dark:border-slate-800"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={`Page ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        style={{ transform: `rotate(${meta.rotation}deg)` }}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Page {idx + 1}</span>
                    )}
                    <div
                      className={`absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center border ${
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white/90 border-slate-300 text-transparent'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs">
                    <span className="font-medium tabular-nums">Page {idx + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => rotatePage(idx, 90)}
                        title="Rotate 90°"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePage(idx, -1)}
                        disabled={idx === 0}
                        title="Move left"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePage(idx, 1)}
                        disabled={idx === pagesMeta.length - 1}
                        title="Move right"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(idx)}
                        title="Delete"
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Main PDF Page Viewport */
        <div className="p-4 sm:p-8 flex flex-col items-center gap-4">
          <div
            className="relative bg-white shadow-md border border-slate-200 dark:border-slate-800 select-text"
            style={{ width: pageViewportSize.width, height: pageViewportSize.height }}
          >
            <canvas ref={canvasRef} className="block" />

            {/* Selectable PDF Text Layer */}
            {activeTool === 'select' && (
              <div className="pdf-text-layer">
                {textSpans.map((span, idx) => (
                  <span
                    key={idx}
                    style={{
                      left: `${span.left}px`,
                      top: `${span.top}px`,
                      fontSize: `${span.fontSize}px`,
                      width: `${span.width}px`,
                    }}
                  >
                    {span.str}
                  </span>
                ))}
              </div>
            )}

            {/* Annotation Interactive Layer */}
            <div
              ref={overlayRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className={`absolute inset-0 ${
                activeTool === 'select'
                  ? 'pointer-events-none'
                  : activeTool === 'text' || activeTool === 'comment'
                  ? 'cursor-crosshair'
                  : 'cursor-crosshair touch-none'
              }`}
            >
              {/* Live drag preview */}
              {dragStart && dragCurr && (
                <div
                  className="absolute border-2 border-blue-600 bg-blue-500/15 pointer-events-none"
                  style={{
                    left: `${Math.min(dragStart.x, dragCurr.x) * 100}%`,
                    top: `${Math.min(dragStart.y, dragCurr.y) * 100}%`,
                    width: `${Math.abs(dragCurr.x - dragStart.x) * 100}%`,
                    height: `${Math.abs(dragCurr.y - dragStart.y) * 100}%`,
                  }}
                />
              )}

              {/* Live freehand stroke */}
              {drawPoints.length > 1 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke={activeColor}
                    strokeWidth="0.4"
                    points={drawPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                  />
                </svg>
              )}

              {/* Rendered annotations */}
              {currentAnnots.map((annot) => {
                const isSelected = annot.id === selectedAnnotId;
                if (annot.type === 'highlight') {
                  return (
                    <div
                      key={annot.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotId(annot.id);
                      }}
                      className={`absolute pointer-events-auto cursor-pointer ${
                        isSelected ? 'ring-2 ring-blue-600' : ''
                      }`}
                      style={{
                        left: `${annot.x * 100}%`,
                        top: `${annot.y * 100}%`,
                        width: `${annot.width * 100}%`,
                        height: `${annot.height * 100}%`,
                        backgroundColor: annot.color,
                        opacity: 0.35,
                      }}
                    />
                  );
                }
                if (annot.type === 'text') {
                  return (
                    <div
                      key={annot.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotId(annot.id);
                      }}
                      onDoubleClick={() => setEditingTextId(annot.id)}
                      className={`absolute pointer-events-auto px-1.5 py-0.5 rounded cursor-move ${
                        isSelected ? 'ring-2 ring-blue-600 bg-white/80' : 'hover:bg-white/60'
                      }`}
                      style={{
                        left: `${annot.x * 100}%`,
                        top: `${annot.y * 100}%`,
                        color: annot.color,
                        fontSize: `${annot.fontSize * zoom}px`,
                      }}
                    >
                      {editingTextId === annot.id ? (
                        <textarea
                          value={annot.text}
                          autoFocus
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnnotations((prev) =>
                              prev.map((a) => (a.id === annot.id && a.type === 'text' ? { ...a, text: val } : a))
                            );
                          }}
                          onBlur={() => {
                            setEditingTextId(null);
                            persistState(pagesMeta, annotations);
                          }}
                          className="bg-white text-slate-900 border border-blue-500 rounded px-1.5 py-0.5 text-sm outline-none min-w-[160px]"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap font-sans">{annot.text}</span>
                      )}
                    </div>
                  );
                }
                if (annot.type === 'comment') {
                  return (
                    <div
                      key={annot.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotId(annot.id);
                      }}
                      className={`absolute pointer-events-auto w-56 rounded-lg border border-amber-400 bg-amber-50 text-slate-900 p-2 shadow-sm text-xs ${
                        isSelected ? 'ring-2 ring-blue-600' : ''
                      }`}
                      style={{
                        left: `${annot.x * 100}%`,
                        top: `${annot.y * 100}%`,
                      }}
                    >
                      <div className="font-semibold text-[11px] text-amber-800 mb-1">Comment</div>
                      {editingTextId === annot.id ? (
                        <textarea
                          value={annot.text}
                          autoFocus
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnnotations((prev) =>
                              prev.map((a) => (a.id === annot.id && a.type === 'comment' ? { ...a, text: val } : a))
                            );
                          }}
                          onBlur={() => {
                            setEditingTextId(null);
                            persistState(pagesMeta, annotations);
                          }}
                          className="w-full bg-white border border-amber-300 rounded p-1 text-xs outline-none"
                        />
                      ) : (
                        <p onDoubleClick={() => setEditingTextId(annot.id)} className="cursor-text">
                          {annot.text}
                        </p>
                      )}
                    </div>
                  );
                }
                if (annot.type === 'shape') {
                  return (
                    <svg
                      key={annot.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotId(annot.id);
                      }}
                      className={`absolute inset-0 w-full h-full pointer-events-none`}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {annot.shape === 'rect' && (
                        <rect
                          x={annot.x * 100}
                          y={annot.y * 100}
                          width={annot.width * 100}
                          height={annot.height * 100}
                          fill="transparent"
                          stroke={annot.color}
                          strokeWidth="0.35"
                          className="pointer-events-auto cursor-pointer"
                        />
                      )}
                      {annot.shape === 'ellipse' && (
                        <ellipse
                          cx={(annot.x + annot.width / 2) * 100}
                          cy={(annot.y + annot.height / 2) * 100}
                          rx={(annot.width / 2) * 100}
                          ry={(annot.height / 2) * 100}
                          fill="transparent"
                          stroke={annot.color}
                          strokeWidth="0.35"
                          className="pointer-events-auto cursor-pointer"
                        />
                      )}
                      {annot.shape === 'line' && (
                        <line
                          x1={annot.x * 100}
                          y1={annot.y * 100}
                          x2={(annot.x + annot.width) * 100}
                          y2={(annot.y + annot.height) * 100}
                          stroke={annot.color}
                          strokeWidth="0.4"
                          className="pointer-events-auto cursor-pointer"
                        />
                      )}
                    </svg>
                  );
                }
                if (annot.type === 'draw') {
                  return (
                    <svg
                      key={annot.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotId(annot.id);
                      }}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        fill="none"
                        stroke={annot.color}
                        strokeWidth="0.4"
                        points={annot.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                        className="pointer-events-auto cursor-pointer"
                      />
                    </svg>
                  );
                }
                if (annot.type === 'image' || annot.type === 'signature') {
                  return (
                    <img
                      key={annot.id}
                      src={annot.dataUrl}
                      alt={annot.type}
                      referrerPolicy="no-referrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotId(annot.id);
                      }}
                      className={`absolute pointer-events-auto cursor-pointer object-contain ${
                        isSelected ? 'ring-2 ring-blue-600' : ''
                      }`}
                      style={{
                        left: `${annot.x * 100}%`,
                        top: `${annot.y * 100}%`,
                        width: `${annot.width * 100}%`,
                        height: `${annot.height * 100}%`,
                      }}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* Bottom Page Navigation & Selected Annotation Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium tabular-nums">
              Page {currentPage + 1} of {pagesMeta.length}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(pagesMeta.length - 1, p + 1))}
              disabled={currentPage >= pagesMeta.length - 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" />

            <button
              type="button"
              onClick={() => {
                const pageText = pageTexts.find(
                  (p) => p.page === (pagesMeta[currentPage]?.originalIndex ?? 0) + 1
                )?.text;
                if (pageText) {
                  navigator.clipboard.writeText(pageText);
                  onNotify('success', 'Copied page text', 'Copied text from current page to clipboard.');
                } else {
                  onNotify('info', 'No selectable text', 'This page appears to be an image or scan.');
                }
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Page Text</span>
            </button>

            {selectedAnnotId && (
              <>
                <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    commitAnnotations(annotations.filter((a) => a.id !== selectedAnnotId));
                    setSelectedAnnotId(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {signatureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-5">
            <h3 className="text-base font-semibold">Add Signature</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Draw your signature or type it below to place on Page {currentPage + 1}.
            </p>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mt-4">
              <button
                type="button"
                onClick={() => setSigMode('draw')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  sigMode === 'draw' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Draw Signature
              </button>
              <button
                type="button"
                onClick={() => setSigMode('type')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  sigMode === 'type' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Type Signature
              </button>
            </div>

            {sigMode === 'draw' ? (
              <div className="mt-4">
                <canvas
                  ref={sigCanvasRef}
                  width={390}
                  height={150}
                  onPointerDown={(e) => {
                    sigDrawingRef.current = true;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ctx = e.currentTarget.getContext('2d')!;
                    ctx.beginPath();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = 'round';
                    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                  }}
                  onPointerMove={(e) => {
                    if (!sigDrawingRef.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ctx = e.currentTarget.getContext('2d')!;
                    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                    ctx.stroke();
                  }}
                  onPointerUp={() => {
                    sigDrawingRef.current = false;
                  }}
                  className="w-full h-[150px] bg-white border border-slate-200 rounded-lg touch-none cursor-crosshair"
                />
                <button
                  type="button"
                  onClick={clearSigCanvas}
                  className="mt-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Clear pad
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <input
                  type="text"
                  value={typedSig}
                  onChange={(e) => setTypedSig(e.target.value)}
                  placeholder="Type your full name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-500"
                />
                <div className="mt-3 p-4 rounded-lg bg-white border border-slate-200 text-slate-900 font-serif italic text-2xl min-h-[64px] flex items-center">
                  {typedSig || 'Signature preview'}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSignatureModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={insertSignature}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Insert Signature
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split & Extract Modal */}
      {splitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-5 space-y-4">
            <h3 className="text-base font-semibold">Split or Extract PDF Pages</h3>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Split into files every N pages ({pagesMeta.length} pages total)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, pagesMeta.length)}
                  value={splitChunkSize}
                  onChange={(e) => setSplitChunkSize(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-24 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleSplitPdf}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Split & Download All
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Or extract specific page range (e.g. 1-3, 5)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={extractRangeText}
                  onChange={(e) => setExtractRangeText(e.target.value)}
                  placeholder="1-3, 5"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrgPages(new Set());
                    handleExtractSelected();
                    setSplitModalOpen(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Extract Range
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSplitModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compress Modal */}
      {compressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold">Compress PDF</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Current file size: <span className="tabular-nums font-medium">{formatBytes(pdfBytes.byteLength)}</span>
              </p>
            </div>

            <div className="space-y-2">
              {[
                {
                  id: 'lossless' as const,
                  title: 'Lossless Structure Cleanup',
                  desc: 'Preserves selectable vector text & metadata cleanup.',
                },
                {
                  id: 'balanced' as const,
                  title: 'Balanced Optimization (Recommended for scans)',
                  desc: 'Re-encodes pages at crisp readable resolution (~135% scale).',
                },
                {
                  id: 'compact' as const,
                  title: 'Maximum Size Reduction',
                  desc: 'Smallest file size for email sharing.',
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCompressMode(opt.id)}
                  className={`w-full text-left p-3 rounded-lg border cursor-pointer transition-colors ${
                    compressMode === opt.id
                      ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.title}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            {compressProgress > 0 && compressProgress < 100 && (
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full transition-all" style={{ width: `${compressProgress}%` }} />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompressModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompressPdf}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Compress & Download
              </button>
            </div>
          </div>
        </div>
      )}
    </EditorShell>
  );
};
