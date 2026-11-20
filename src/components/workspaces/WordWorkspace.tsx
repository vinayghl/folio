import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Link from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Search,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { StoredDocument } from '../../types/workspace';
import { EditorShell, ExportOption } from '../EditorShell';
import {
  docxBufferToHtml,
  htmlToDocxBuffer,
  htmlToRtf,
  legacyDocToHtml,
  odtBufferToHtml,
  rtfToHtml,
} from '../../lib/officeParsers';
import { htmlToPdfBytes } from '../../lib/converters';
import { downloadBlob, downloadBuffer, replaceFileExtension } from '../../lib/storage';

interface WordWorkspaceProps {
  doc: StoredDocument;
  onUpdateDoc: (updated: StoredDocument) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const WordWorkspace: React.FC<WordWorkspaceProps> = ({
  doc,
  onUpdateDoc,
  onBack,
  isDark,
  onToggleTheme,
  onNotify,
}) => {
  const [loading, setLoading] = useState(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [warningNotice, setWarningNotice] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [zoom, setZoom] = useState(1);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [wordCount, setWordCount] = useState({ words: 0, chars: 0 });
  const [headings, setHeadings] = useState<Array<{ level: number; text: string }>>([]);
  const [fontSizePx, setFontSizePx] = useState('15px');

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      ImageExtension.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const plain = ed.getText();
      const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
      setWordCount({ words, chars: plain.length });

      // Update outline headings
      const foundHeadings: Array<{ level: number; text: string }> = [];
      ed.state.doc.descendants((node) => {
        if (node.type.name === 'heading' && node.textContent.trim()) {
          foundHeadings.push({
            level: node.attrs.level || 1,
            text: node.textContent.trim(),
          });
        }
      });
      setHeadings(foundHeadings);

      setSaveStatus('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          await onUpdateDoc({
            ...docRef.current,
            lastModified: Date.now(),
            workingDraft: html,
          });
          setSaveStatus('saved');
        } catch {
          setSaveStatus('unsaved');
        }
      }, 600);
    },
  });

  // Load document content into Tiptap
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setWarningNotice(null);
      try {
        let initialHtml = '';
        if (typeof doc.workingDraft === 'string' && doc.workingDraft.length > 0) {
          initialHtml = doc.workingDraft;
        } else if (doc.ext === 'docx') {
          const res = await docxBufferToHtml(doc.originalData);
          initialHtml = res.html;
        } else if (doc.ext === 'odt') {
          initialHtml = await odtBufferToHtml(doc.originalData);
          setWarningNotice('ODT imported: complex OpenDocument styles are normalized to standard rich text.');
        } else if (doc.ext === 'rtf') {
          const text = new TextDecoder().decode(doc.originalData);
          initialHtml = rtfToHtml(text);
        } else if (doc.ext === 'doc') {
          initialHtml = await legacyDocToHtml(doc.originalData);
          setWarningNotice(
            'Legacy binary .doc detected: readable text was extracted. Export as .docx or .pdf to save in a modern format.'
          );
        } else {
          initialHtml = `<p>${new TextDecoder().decode(doc.originalData)}</p>`;
        }

        if (!cancelled) {
          editor.commands.setContent(initialHtml || '<p></p>');
          const plain = editor.getText();
          setWordCount({
            words: plain.trim() ? plain.trim().split(/\s+/).length : 0,
            chars: plain.length,
          });
          const foundHeadings: Array<{ level: number; text: string }> = [];
          editor.state.doc.descendants((node) => {
            if (node.type.name === 'heading' && node.textContent.trim()) {
              foundHeadings.push({ level: node.attrs.level || 1, text: node.textContent.trim() });
            }
          });
          setHeadings(foundHeadings);
        }
      } catch (err) {
        if (!cancelled) {
          onNotify('error', 'Import Error', err instanceof Error ? err.message : 'Unable to parse document.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [doc.id, editor]);

  const handleFindAndReplace = (replaceAll: boolean) => {
    if (!editor || !findQuery) return;
    const html = editor.getHTML();
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, replaceAll ? 'g' : '');
    if (!regex.test(html)) {
      onNotify('info', 'No matches', `"${findQuery}" was not found.`);
      return;
    }
    const updated = html.replace(regex, replaceText);
    editor.commands.setContent(updated);
    onNotify('success', replaceAll ? 'Replaced all matches' : 'Replaced first match');
  };

  const handleInsertImage = (file: File) => {
    if (!editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  const exportOptions: ExportOption[] = [
    {
      label: 'Download Word Document (.docx)',
      description: 'Standard Microsoft Word format with tables & styles',
      onClick: async () => {
        if (!editor) return;
        setBusyMessage('Building DOCX...');
        try {
          const buf = await htmlToDocxBuffer(editor.getHTML());
          downloadBuffer(
            buf,
            replaceFileExtension(doc.name, 'docx'),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          );
          onNotify('success', 'DOCX Downloaded');
        } catch (err) {
          onNotify('error', 'Export Failed', err instanceof Error ? err.message : 'Unable to build DOCX.');
        } finally {
          setBusyMessage(null);
        }
      },
    },
    {
      label: 'Export as PDF (.pdf)',
      description: 'Paginated A4 print-ready PDF',
      onClick: async () => {
        if (!editor) return;
        setBusyMessage('Rendering PDF...');
        try {
          const pdfBytes = await htmlToPdfBytes(editor.getHTML());
          downloadBuffer(pdfBytes, replaceFileExtension(doc.name, 'pdf'), 'application/pdf');
          onNotify('success', 'PDF Downloaded');
        } catch (err) {
          onNotify('error', 'PDF Export Failed', err instanceof Error ? err.message : 'Failed to create PDF.');
        } finally {
          setBusyMessage(null);
        }
      },
    },
    {
      label: 'Export as Rich Text (.rtf)',
      description: 'Compatible with WordPad, macOS TextEdit, LibreOffice',
      onClick: () => {
        if (!editor) return;
        const rtf = htmlToRtf(editor.getHTML());
        downloadBlob(new Blob([rtf], { type: 'application/rtf' }), replaceFileExtension(doc.name, 'rtf'));
      },
    },
    {
      label: 'Export as HTML (.html)',
      description: 'Clean standalone web page',
      onClick: () => {
        if (!editor) return;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.name}</title></head><body>${editor.getHTML()}</body></html>`;
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), replaceFileExtension(doc.name, 'html'));
      },
    },
    {
      label: 'Export as Plain Text (.txt)',
      onClick: () => {
        if (!editor) return;
        downloadBlob(
          new Blob([editor.getText()], { type: 'text/plain;charset=utf-8' }),
          replaceFileExtension(doc.name, 'txt')
        );
      },
    },
  ];

  const toolbar = editor ? (
    <div className="flex items-center gap-1 min-w-max">
      {/* Heading Selector */}
      <select
        value={
          editor.isActive('heading', { level: 1 })
            ? 'h1'
            : editor.isActive('heading', { level: 2 })
            ? 'h2'
            : editor.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p'
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') editor.chain().focus().setParagraph().run();
          else if (v === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
          else if (v === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
          else if (v === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
        }}
        className="px-2 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none cursor-pointer"
      >
        <option value="p">Normal Text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      {/* Font Family */}
      <select
        onChange={(e) => {
          const val = e.target.value;
          if (val) editor.chain().focus().setFontFamily(val).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none cursor-pointer"
      >
        <option value="">Default Sans</option>
        <option value="Georgia, serif">Georgia Serif</option>
        <option value="'Times New Roman', serif">Times New Roman</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="'JetBrains Mono', monospace">Monospace</option>
      </select>

      {/* Page Font Size */}
      <select
        value={fontSizePx}
        onChange={(e) => setFontSizePx(e.target.value)}
        title="Base document font size"
        className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none cursor-pointer tabular-nums"
      >
        <option value="13px">13 px</option>
        <option value="15px">15 px</option>
        <option value="17px">17 px</option>
        <option value="19px">19 px</option>
      </select>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('bold')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('italic')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('underline')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <UnderlineIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('strike')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </button>

      {/* Text Color */}
      <label className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1" title="Text color">
        <span className="text-xs font-bold underline decoration-2 decoration-blue-600">A</span>
        <input
          type="color"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
        />
      </label>

      {/* Highlight Color */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
        title="Highlight background"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('highlight')
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Highlighter className="w-3.5 h-3.5" />
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      {/* Alignment */}
      {[
        { align: 'left', icon: AlignLeft },
        { align: 'center', icon: AlignCenter },
        { align: 'right', icon: AlignRight },
        { align: 'justify', icon: AlignJustify },
      ].map(({ align, icon: Icon }) => (
        <button
          key={align}
          type="button"
          onClick={() => editor.chain().focus().setTextAlign(align).run()}
          title={`Align ${align}`}
          className={`p-1.5 rounded-md cursor-pointer ${
            editor.isActive({ textAlign: align })
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('bulletList')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('orderedList')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert 3x3 table"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Table2 className="w-3.5 h-3.5" />
        <span>Table</span>
      </button>

      {editor.isActive('table') && (
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-slate-700 rounded cursor-pointer"
          >
            +Row
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-slate-700 rounded cursor-pointer"
          >
            +Col
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-1.5 py-0.5 text-red-600 hover:bg-white dark:hover:bg-slate-700 rounded cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        title="Insert image"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
          if (f) handleInsertImage(f);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => {
          const prev = editor.getAttributes('link').href || 'https://';
          setLinkUrl(prev);
          setLinkModalOpen(true);
        }}
        title="Insert hyperlink"
        className={`p-1.5 rounded-md cursor-pointer ${
          editor.isActive('link')
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Link2 className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Insert page break"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Minus className="w-3.5 h-3.5" />
        <span>Break</span>
      </button>

      <button
        type="button"
        onClick={() => setFindOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs cursor-pointer ${
          findOpen
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Find</span>
      </button>
    </div>
  ) : null;

  const sidebar = (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Document Statistics</h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Words</span>
            <span className="font-mono tabular-nums font-medium">{wordCount.words}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Characters</span>
            <span className="font-mono tabular-nums font-medium">{wordCount.chars}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Outline</h3>
        {headings.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Add Heading 1–3 styles to build a navigable document outline.
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {headings.map((h, i) => (
              <li
                key={i}
                style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
                className="text-slate-700 dark:text-slate-300 truncate"
              >
                {h.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <EditorShell
      title={doc.name}
      formatLabel="Word Document"
      onRename={(newName) => onUpdateDoc({ ...doc, name: newName, lastModified: Date.now() })}
      onBack={onBack}
      saveStatus={saveStatus}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      canUndo={editor?.can().undo()}
      canRedo={editor?.can().redo()}
      onUndo={() => editor?.chain().focus().undo().run()}
      onRedo={() => editor?.chain().focus().redo().run()}
      zoom={zoom}
      onZoomIn={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
      onZoomOut={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))}
      exportOptions={exportOptions}
      toolbar={toolbar}
      sidebar={sidebar}
      sidebarTitle="Outline"
    >
      {warningNotice && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          {warningNotice}
        </div>
      )}

      {busyMessage && (
        <div className="bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-900 px-4 py-2 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{busyMessage}</span>
        </div>
      )}

      {findOpen && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find text..."
            className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with..."
            className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => handleFindAndReplace(false)}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => handleFindAndReplace(true)}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            Replace All
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center h-96 gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-sm">Opening document in rich-text editor...</p>
        </div>
      ) : (
        <div className="p-4 sm:p-8 flex justify-center">
          <div
            className="w-full max-w-[816px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-sm px-8 sm:px-14 py-12 origin-top transition-transform"
            style={{ transform: `scale(${zoom})`, fontSize: fontSizePx }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      )}

      {linkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xl">
            <h3 className="text-sm font-semibold">Insert Hyperlink</h3>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-3 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  editor?.chain().focus().unsetLink().run();
                  setLinkModalOpen(false);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Remove Link
              </button>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (linkUrl.trim()) {
                    editor?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
                  }
                  setLinkModalOpen(false);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </EditorShell>
  );
};
