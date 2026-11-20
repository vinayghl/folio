import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  FlipHorizontal,
  FlipVertical,
  Lock,
  RotateCcw,
  RotateCw,
  Unlock,
  X,
} from 'lucide-react';
import { StoredDocument } from '../../types/workspace';
import { EditorShell, ExportOption } from '../EditorShell';
import { imagesToPdfBytes } from '../../lib/converters';
import { downloadBlob, downloadBuffer, formatBytes, replaceFileExtension } from '../../lib/storage';

interface ImageWorkspaceProps {
  doc: StoredDocument;
  onUpdateDoc: (updated: StoredDocument) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({
  doc,
  onUpdateDoc,
  onBack,
  isDark,
  onToggleTheme,
  onNotify,
}) => {
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [targetW, setTargetW] = useState(0);
  const [targetH, setTargetH] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg' | 'webp'>(
    doc.ext === 'jpg' || doc.ext === 'jpeg' ? 'jpg' : doc.ext === 'webp' ? 'webp' : 'png'
  );
  const [quality, setQuality] = useState(0.88);
  const [estimatedBytes, setEstimatedBytes] = useState<number>(doc.size);
  const [zoom, setZoom] = useState(1);

  // Crop mode
  const [cropping, setCropping] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const cropDragRef = useRef<{ startX: number; startY: number } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Load initial image buffer into object URL
  useEffect(() => {
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };
    const activeBuf = doc.workingDraft instanceof ArrayBuffer ? doc.workingDraft : doc.originalData;
    const blob = new Blob([activeBuf], { type: mimeMap[doc.ext] || 'image/png' });
    const url = URL.createObjectURL(blob);
    setSourceUrl(url);

    const img = new Image();
    img.onload = () => {
      imgElementRef.current = img;
      const w = img.naturalWidth || 800;
      const h = img.naturalHeight || 600;
      setNaturalSize({ w, h });
      setTargetW(w);
      setTargetH(h);
    };
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [doc.id, doc.workingDraft]);

  // Render preview canvas whenever transforms/filters change
  const renderToCanvas = (canvas: HTMLCanvasElement, applyCropBox?: { x: number; y: number; w: number; h: number }) => {
    const img = imgElementRef.current;
    if (!img || targetW <= 0 || targetH <= 0) return;

    const swapped = rotation === 90 || rotation === 270;
    const baseW = swapped ? targetH : targetW;
    const baseH = swapped ? targetW : targetH;

    if (applyCropBox) {
      const sx = Math.round(applyCropBox.x * baseW);
      const sy = Math.round(applyCropBox.y * baseH);
      const sw = Math.max(10, Math.round(applyCropBox.w * baseW));
      const sh = Math.max(10, Math.round(applyCropBox.h * baseH));

      const temp = document.createElement('canvas');
      temp.width = baseW;
      temp.height = baseH;
      const tCtx = temp.getContext('2d')!;
      tCtx.save();
      tCtx.translate(baseW / 2, baseH / 2);
      tCtx.rotate((rotation * Math.PI) / 180);
      tCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      tCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale ? 100 : 0}%)`;
      tCtx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
      tCtx.restore();

      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d')!.drawImage(temp, sx, sy, sw, sh, 0, 0, sw, sh);
      return;
    }

    canvas.width = baseW;
    canvas.height = baseH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, baseW, baseH);
    ctx.save();
    ctx.translate(baseW / 2, baseH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale ? 100 : 0}%)`;
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  };

  useEffect(() => {
    const c = previewCanvasRef.current;
    if (!c || !imgElementRef.current) return;
    renderToCanvas(c);

    // Update estimated output byte size
    const mime = outputFormat === 'jpg' ? 'image/jpeg' : outputFormat === 'webp' ? 'image/webp' : 'image/png';
    c.toBlob(
      (b) => {
        if (b) setEstimatedBytes(b.size);
      },
      mime,
      quality
    );
  }, [naturalSize, targetW, targetH, rotation, flipH, flipV, brightness, contrast, grayscale, outputFormat, quality]);

  const applyCrop = async () => {
    const temp = document.createElement('canvas');
    renderToCanvas(temp, cropRect);
    const mime = outputFormat === 'jpg' ? 'image/jpeg' : outputFormat === 'webp' ? 'image/webp' : 'image/png';
    const blob = await new Promise<Blob>((res) => temp.toBlob((b) => res(b!), mime, quality));
    const buf = await blob.arrayBuffer();
    setSaveStatus('saving');
    await onUpdateDoc({
      ...doc,
      lastModified: Date.now(),
      workingDraft: buf,
    });
    setSaveStatus('saved');
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCropping(false);
    onNotify('success', 'Crop applied', `New dimensions: ${temp.width} × ${temp.height} px`);
  };

  const handleWidthChange = (val: number) => {
    const w = Math.max(1, Math.min(8000, val || 1));
    setTargetW(w);
    if (lockAspect && naturalSize.w > 0) {
      setTargetH(Math.max(1, Math.round((w / naturalSize.w) * naturalSize.h)));
    }
  };

  const handleHeightChange = (val: number) => {
    const h = Math.max(1, Math.min(8000, val || 1));
    setTargetH(h);
    if (lockAspect && naturalSize.h > 0) {
      setTargetW(Math.max(1, Math.round((h / naturalSize.h) * naturalSize.w)));
    }
  };

  const exportAs = async (fmt: 'png' | 'jpg' | 'webp') => {
    const offscreen = document.createElement('canvas');
    renderToCanvas(offscreen);
    const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    const blob = await new Promise<Blob>((res) => offscreen.toBlob((b) => res(b!), mime, quality));
    downloadBlob(blob, replaceFileExtension(doc.name, fmt));
    onNotify('success', `Exported ${fmt.toUpperCase()}`, `Size: ${formatBytes(blob.size)}`);
  };

  const exportOptions: ExportOption[] = [
    {
      label: `Download ${outputFormat.toUpperCase()} (${formatBytes(estimatedBytes)})`,
      description: 'Current dimensions, edits, and compression setting',
      onClick: () => exportAs(outputFormat),
    },
    {
      label: 'Download as PNG (.png)',
      description: 'Lossless with transparency support',
      onClick: () => exportAs('png'),
    },
    {
      label: 'Download as JPEG (.jpg)',
      description: 'Compressed photography format',
      onClick: () => exportAs('jpg'),
    },
    {
      label: 'Download as WebP (.webp)',
      description: 'Modern web-optimized compression',
      onClick: () => exportAs('webp'),
    },
    {
      label: 'Convert to PDF (.pdf)',
      description: 'Single-page A4 document',
      onClick: async () => {
        const offscreen = document.createElement('canvas');
        renderToCanvas(offscreen);
        const blob = await new Promise<Blob>((res) => offscreen.toBlob((b) => res(b!), 'image/png'));
        const buf = await blob.arrayBuffer();
        const pdf = await imagesToPdfBytes([{ name: doc.name, buffer: buf, mimeType: 'image/png' }], 'a4');
        downloadBuffer(pdf, replaceFileExtension(doc.name, 'pdf'), 'application/pdf');
      },
    },
  ];

  const toolbar = (
    <div className="flex items-center gap-1.5 min-w-max">
      <button
        type="button"
        onClick={() => setRotation((r) => (r + 270) % 360)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Rotate Left</span>
      </button>
      <button
        type="button"
        onClick={() => setRotation((r) => (r + 90) % 360)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <RotateCw className="w-3.5 h-3.5" />
        <span>Rotate Right</span>
      </button>
      <button
        type="button"
        onClick={() => setFlipH((v) => !v)}
        className={`p-1.5 rounded-md cursor-pointer ${
          flipH ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title="Flip horizontal"
      >
        <FlipHorizontal className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setFlipV((v) => !v)}
        className={`p-1.5 rounded-md cursor-pointer ${
          flipV ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title="Flip vertical"
      >
        <FlipVertical className="w-3.5 h-3.5" />
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      {!cropping ? (
        <button
          type="button"
          onClick={() => {
            setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
            setCropping(true);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Crop className="w-3.5 h-3.5" />
          <span>Crop</span>
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={applyCrop}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Crop</span>
          </button>
          <button
            type="button"
            onClick={() => setCropping(false)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">W</span>
        <input
          type="number"
          value={targetW}
          onChange={(e) => handleWidthChange(parseInt(e.target.value, 10))}
          className="w-16 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums"
        />
        <button
          type="button"
          onClick={() => setLockAspect((v) => !v)}
          title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          {lockAspect ? <Lock className="w-3.5 h-3.5 text-blue-600" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        <span className="text-slate-500">H</span>
        <input
          type="number"
          value={targetH}
          onChange={(e) => handleHeightChange(parseInt(e.target.value, 10))}
          className="w-16 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums"
        />
      </div>
    </div>
  );

  const sidebar = (
    <div className="p-4 space-y-5 text-xs">
      <div>
        <h3 className="font-semibold text-slate-500 dark:text-slate-400 mb-2">Format & Compression</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1">Output Format</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setOutputFormat(fmt)}
                  className={`py-1 rounded font-medium uppercase cursor-pointer ${
                    outputFormat === fmt ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : ''
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {outputFormat !== 'png' && (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-500 dark:text-slate-400">Quality</span>
                <span className="font-mono tabular-nums font-medium">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          )}

          <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Original Size</span>
            <span className="font-mono tabular-nums">{formatBytes(doc.size)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Estimated Output</span>
            <span className="font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
              {formatBytes(estimatedBytes)}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
        <h3 className="font-semibold text-slate-500 dark:text-slate-400">Adjustments</h3>
        <div>
          <div className="flex justify-between mb-1">
            <span>Brightness</span>
            <span className="font-mono tabular-nums">{brightness}%</span>
          </div>
          <input
            type="range"
            min={40}
            max={160}
            value={brightness}
            onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
            className="w-full accent-blue-600"
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span>Contrast</span>
            <span className="font-mono tabular-nums">{contrast}%</span>
          </div>
          <input
            type="range"
            min={40}
            max={160}
            value={contrast}
            onChange={(e) => setContrast(parseInt(e.target.value, 10))}
            className="w-full accent-blue-600"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={grayscale}
            onChange={(e) => setGrayscale(e.target.checked)}
            className="rounded accent-blue-600"
          />
          <span>Grayscale</span>
        </label>
        <button
          type="button"
          onClick={() => {
            setTargetW(naturalSize.w);
            setTargetH(naturalSize.h);
            setRotation(0);
            setFlipH(false);
            setFlipV(false);
            setBrightness(100);
            setContrast(100);
            setGrayscale(false);
          }}
          className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
        >
          Reset Adjustments
        </button>
      </div>
    </div>
  );

  return (
    <EditorShell
      title={doc.name}
      formatLabel={`${doc.ext.toUpperCase()} Image`}
      onRename={(newName) => onUpdateDoc({ ...doc, name: newName, lastModified: Date.now() })}
      onBack={onBack}
      saveStatus={saveStatus}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      zoom={zoom}
      onZoomIn={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
      onZoomOut={() => setZoom((z) => Math.max(0.25, +(z - 0.15).toFixed(2)))}
      onResetOriginal={async () => {
        await onUpdateDoc({ ...doc, workingDraft: undefined, lastModified: Date.now() });
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setBrightness(100);
        setContrast(100);
        setGrayscale(false);
        onNotify('info', 'Reverted to original image');
      }}
      exportOptions={exportOptions}
      toolbar={toolbar}
      sidebar={sidebar}
      sidebarTitle="Adjust"
    >
      <div className="p-6 flex items-center justify-center min-h-full overflow-auto">
        {sourceUrl && (
          <div
            className="relative inline-block shadow-md border border-slate-200 dark:border-slate-800 bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] [background-size:20px_20px]"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            <canvas ref={previewCanvasRef} className="max-w-[78vw] max-h-[75vh] object-contain block" />

            {cropping && (
              <div
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const sx = (e.clientX - rect.left) / rect.width;
                  const sy = (e.clientY - rect.top) / rect.height;
                  cropDragRef.current = { startX: sx, startY: sy };
                  setCropRect({ x: sx, y: sy, w: 0.02, h: 0.02 });
                }}
                onPointerMove={(e) => {
                  if (!cropDragRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                  const sx = cropDragRef.current.startX;
                  const sy = cropDragRef.current.startY;
                  setCropRect({
                    x: Math.min(sx, cx),
                    y: Math.min(sy, cy),
                    w: Math.max(0.05, Math.abs(cx - sx)),
                    h: Math.max(0.05, Math.abs(cy - sy)),
                  });
                }}
                onPointerUp={() => {
                  cropDragRef.current = null;
                }}
                className="absolute inset-0 bg-slate-950/45 cursor-crosshair touch-none"
              >
                <div
                  className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] pointer-events-none"
                  style={{
                    left: `${cropRect.x * 100}%`,
                    top: `${cropRect.y * 100}%`,
                    width: `${cropRect.w * 100}%`,
                    height: `${cropRect.h * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </EditorShell>
  );
};
