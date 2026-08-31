'use client';

import { FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DocumentEntry = { name: string; path: string; extension: string; size: number };
type Sheet = { name: string; rows: string[][]; totalRows: number; totalColumns: number };
type Preview =
  | { kind: 'spreadsheet'; sheets: Sheet[] }
  | { kind: 'word'; html: string; warnings: string[] }
  | { kind: 'markdown'; source: string }
  | { kind: 'text'; source: string; label: string };

const maxOfficePreviewBytes = 30 * 1024 * 1024;
const maxTextPreviewBytes = 8 * 1024 * 1024;
const textPreviewExtensions = new Set(['txt', 'log', 'csv', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'properties', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'sql', 'sh', 'bash', 'zsh', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'php', 'rb', 'vue', 'svelte', 'svg']);

function isTextPreview(extension: string) {
  return extension === 'md' || textPreviewExtensions.has(extension);
}

export function DocumentPreview({ entry, url }: { entry: DocumentEntry; url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (entry.size === 0) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setLoading(false);
          setError(`这个 ${entry.extension.toUpperCase()} 文件为空（0 B），可能上传未完成。请重新上传或下载原文件检查。`);
        }
      });
      return () => { cancelled = true; };
    }

    const maxPreviewBytes = isTextPreview(entry.extension) ? maxTextPreviewBytes : maxOfficePreviewBytes;
    if (entry.size > maxPreviewBytes) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setLoading(false);
          setError(`为避免浏览器占用过多内存，超过 ${Math.round(maxPreviewBytes / 1024 / 1024)} MB 的文件请下载后查看。`);
        }
      });
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('文件读取失败');
        const nextPreview = entry.extension === 'md'
          ? { kind: 'markdown' as const, source: await response.text() }
          : textPreviewExtensions.has(entry.extension)
            ? { kind: 'text' as const, source: await response.text(), label: entry.extension.toUpperCase() || 'TEXT' }
          : await parseOfficeDocument(entry.extension, await response.arrayBuffer());
        if (!cancelled) setPreview(nextPreview);
      } catch (reason) {
        if (!cancelled) setError(documentErrorMessage(entry.extension, reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [entry.extension, entry.path, entry.size, url]);

  if (loading) return <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />正在准备本地预览…</div>;
  if (error) return <UnsupportedDocument message={error} />;
  if (!preview) return null;
  if (preview.kind === 'spreadsheet') return <SpreadsheetPreview sheets={preview.sheets} />;
  if (preview.kind === 'word') return <WordPreview html={preview.html} warnings={preview.warnings} />;
  if (preview.kind === 'text') return <TextPreview source={preview.source} label={preview.label} />;
  return <MarkdownPreview source={preview.source} />;
}

function documentErrorMessage(extension: string, reason: unknown) {
  const detail = reason instanceof Error ? reason.message : '';
  if (extension === 'xlsx' && /corrupted zip|end of data|invalid zip|zip/i.test(detail)) {
    return '这个 Excel 文件无法解析，可能已损坏或上传不完整。请重新上传，或下载原文件后用 Office、WPS 检查。';
  }
  return detail || '无法解析这个文档';
}

async function parseOfficeDocument(extension: string, buffer: ArrayBuffer): Promise<Preview> {
  if (extension === 'xlsx') return parseSpreadsheet(buffer);
  if (extension === 'docx') return parseDocx(buffer);
  if (extension === 'xls' || extension === 'doc') throw new Error(`旧版 .${extension.toUpperCase()} 二进制格式暂不能安全地在浏览器中解析；请下载后使用 Office 或 WPS 打开。`);
  throw new Error('该文档格式暂不支持预览');
}

async function parseSpreadsheet(buffer: ArrayBuffer): Promise<Preview> {
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.map((worksheet) => {
    const totalRows = worksheet.actualRowCount;
    const totalColumns = worksheet.actualColumnCount;
    return {
      name: worksheet.name,
      totalRows,
      totalColumns,
      rows: Array.from({ length: Math.min(totalRows, 300) }, (_, rowIndex) => Array.from({ length: Math.min(totalColumns, 80) }, (_, columnIndex) => worksheet.getCell(rowIndex + 1, columnIndex + 1).text)),
    };
  });
  return { kind: 'spreadsheet', sheets };
}

async function parseDocx(buffer: ArrayBuffer): Promise<Preview> {
  const mammoth = await import('mammoth');
  const purifierModule = await import('dompurify');
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const purifier = purifierModule.default(window);
  const html = purifier.sanitize(result.value, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
  return { kind: 'word', html, warnings: result.messages.map((message) => message.message) };
}

function SpreadsheetPreview({ sheets }: { sheets: Sheet[] }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  const columnLabels = useMemo(() => Array.from({ length: sheet?.rows.reduce((largest, row) => Math.max(largest, row.length), 0) || 0 }, (_, index) => columnLabel(index)), [sheet]);
  if (!sheet) return <UnsupportedDocument icon={FileSpreadsheet} message="工作簿中没有可显示的工作表。" />;
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-200"><FileSpreadsheet className="size-4" /></span><p className="mr-auto text-xs text-muted-foreground">本地表格预览 · {sheet.totalRows} 行 × {sheet.totalColumns} 列</p><div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-white/8 bg-black/10 p-1">{sheets.map((item, index) => <button key={item.name} onClick={() => setActiveSheet(index)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs transition ${index === activeSheet ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/6 hover:text-foreground'}`}>{item.name}</button>)}</div></div><div className="max-h-[61vh] overflow-auto rounded-xl border border-white/10 bg-[#f9fcfa] text-slate-800"><table className="min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-slate-500"><tr><th className="sticky left-0 z-20 w-11 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-center font-medium">#</th>{columnLabels.map((label) => <th key={label} className="min-w-28 border-b border-r border-slate-200 px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-emerald-50/50"><th className="sticky left-0 z-[1] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium text-slate-400">{rowIndex + 1}</th>{columnLabels.map((_, columnIndex) => <td key={columnIndex} className="max-w-72 whitespace-pre-wrap border-b border-r border-slate-200 px-3 py-2 align-top">{row[columnIndex]}</td>)}</tr>)}</tbody></table>{sheet.totalRows > sheet.rows.length || sheet.totalColumns > columnLabels.length ? <p className="sticky left-0 p-3 text-xs text-slate-500">当前仅显示前 300 行、80 列。下载原文件可查看完整内容。</p> : null}</div></div>;
}

function WordPreview({ html, warnings }: { html: string; warnings: string[] }) {
  return <div className="space-y-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex size-8 items-center justify-center rounded-lg bg-sky-300/10 text-sky-100"><FileText className="size-4" /></span>Word 文档本地转换预览</p><article className="document-preview max-h-[61vh] overflow-auto rounded-xl bg-white px-6 py-8 text-[15px] leading-7 text-slate-800 shadow-inner sm:px-10" dangerouslySetInnerHTML={{ __html: html }} />{warnings.length ? <p className="text-xs text-muted-foreground">部分格式未完全转换，原文内容不受影响。</p> : null}</div>;
}

function MarkdownPreview({ source }: { source: string }) {
  return <article className="markdown-preview max-h-[61vh] overflow-auto rounded-xl bg-white px-6 py-8 text-[15px] leading-7 text-slate-800 shadow-inner sm:px-10"><ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown></article>;
}

function TextPreview({ source, label }: { source: string; label: string }) {
  const formatted = useMemo(() => {
    if (label !== 'JSON') return source;
    try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return source; }
  }, [label, source]);
  return <div className="space-y-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex size-8 items-center justify-center rounded-lg bg-violet-300/10 text-violet-100"><FileText className="size-4" /></span>{label} 安全源码预览 · 文件内容不会执行</p><pre className="max-h-[61vh] overflow-auto rounded-xl border border-white/8 bg-[#07100f] p-4 font-mono text-xs leading-6 text-emerald-50 whitespace-pre-wrap">{formatted}</pre></div>;
}

function UnsupportedDocument({ message, icon: Icon = FileText }: { message: string; icon?: typeof FileText }) {
  return <div className="flex min-h-[300px] flex-col items-center justify-center text-center"><span className="flex size-11 items-center justify-center rounded-xl bg-white/6 text-muted-foreground"><Icon className="size-5" /></span><p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">{message}</p></div>;
}

function columnLabel(index: number) {
  let current = index + 1;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}
