"use client";

import { useCallback, useEffect, useState } from "react";

type Attachment = { id: string; fileName: string; fileUrl: string };

export function ErpAttachments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/erp/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
    if (response.ok) setItems(await response.json());
  }, [entityId, entityType]);

  useEffect(() => {
    let active = true;
    fetch(`/api/erp/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(async (response) => response.ok ? response.json() as Promise<Attachment[]> : [])
      .then((rows) => { if (active) setItems(rows); });
    return () => { active = false; };
  }, [entityId, entityType]);

  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("entityType", entityType); form.set("entityId", entityId); form.set("file", file);
    const response = await fetch("/api/erp/attachments", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "上传失败");
    setError("");
    await load();
  }

  return <div className="mt-4 rounded border p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">附件（非必填）</span><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx" className="w-56 text-xs" onChange={(event) => upload(event.target.files?.[0])} /></div>{error && <p className="text-xs text-red-600">{error}</p>}<div className="mt-2 space-y-1">{items.length ? items.map((attachment) => <a key={attachment.id} href={attachment.fileUrl} target="_blank" className="block text-sm text-blue-600 hover:underline">{attachment.fileName}</a>) : <p className="text-xs text-gray-400">暂无附件</p>}</div></div>;
}
