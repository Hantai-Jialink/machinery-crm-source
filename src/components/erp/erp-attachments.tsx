"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

type Attachment = { id: string; fileName: string; fileUrl: string };
const acceptedFiles = "image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx";
export const attachmentHelpText = "可上传到货、送货单、数量异常凭证、零件损坏等照片或电子版凭据。";

export async function uploadErpAttachments(entityType: string, entityId: string, files: File[]) {
  const failed: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.set("entityType", entityType); form.set("entityId", entityId); form.set("file", file);
    const response = await fetch("/api/erp/attachments", { method: "POST", body: form });
    if (!response.ok) failed.push(file.name);
  }
  return failed;
}

export function PendingErpAttachments({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className="rounded-lg border border-gray-200 p-3">
    <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Paperclip className="h-4 w-4" />附件</button><span className="text-xs text-gray-400">非必填，已选择 {files.length} 个文件</span></div>
    <input ref={inputRef} type="file" multiple accept={acceptedFiles} className="hidden" onChange={(event) => { const next = Array.from(event.target.files || []); if (next.length) onChange([...files, ...next]); event.target.value = ""; }} />
    <p className="mt-2 text-xs text-gray-500">{attachmentHelpText}</p>
    {files.length > 0 && <div className="mt-2 space-y-1">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs"><span className="truncate">{file.name}</span><button type="button" title="移除附件" onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))} className="text-gray-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button></div>)}</div>}
  </div>;
}

export function ErpAttachments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/erp/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
    if (response.ok) setItems(await response.json());
  }, [entityId, entityType]);

  useEffect(() => { void load(); }, [load]);

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    const failed = await uploadErpAttachments(entityType, entityId, files);
    setUploading(false);
    setError(failed.length ? `以下附件上传失败：${failed.join("、")}` : "");
    await load();
  }

  return <div className="mt-4 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">附件（非必填）</span><button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><Paperclip className="h-4 w-4" />{uploading ? "上传中..." : "附件"}</button><input ref={inputRef} type="file" multiple accept={acceptedFiles} className="hidden" onChange={(event) => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} /></div><p className="mt-2 text-xs text-gray-500">{attachmentHelpText}</p>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}<div className="mt-2 space-y-1">{items.length ? items.map((attachment) => <a key={attachment.id} href={attachment.fileUrl} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 hover:underline">{attachment.fileName}</a>) : <p className="text-xs text-gray-400">暂无附件</p>}</div></div>;
}
