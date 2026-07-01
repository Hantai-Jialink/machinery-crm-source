"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type MaterialOption = {
  id: string;
  code?: string | null;
  name?: string | null;
  spec?: string | null;
  unit?: string | null;
};

function optionLabel(material: MaterialOption) {
  const spec = material.spec ? `(${material.spec})` : "";
  return `${material.code || ""} - ${material.name || ""}${spec}`.trim();
}

export function MaterialCombobox({
  materials,
  value,
  onChange,
  placeholder = "输入编码 / 名称 / 规格搜索",
  maxVisible = 80,
}: {
  materials: MaterialOption[];
  value: string;
  onChange: (materialId: string) => void;
  placeholder?: string;
  maxVisible?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => materials.find((material) => material.id === value),
    [materials, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = q
      ? materials.filter((material) => {
          const haystack = `${material.code || ""} ${material.name || ""} ${material.spec || ""}`.toLowerCase();
          return haystack.includes(q);
        })
      : materials;
    return source.slice(0, maxVisible);
  }, [materials, query, maxVisible]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (materialId: string) => {
    onChange(materialId);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[220px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-left focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        <span className={selected ? "text-gray-900 truncate" : "text-gray-400"}>
          {selected ? optionLabel(selected) : "选择物料"}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <X
              className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700"
              onClick={(event) => {
                event.stopPropagation();
                choose("");
              }}
            />
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (filtered.length === 0) return;
                    setActiveIndex((idx) => Math.min(idx + 1, filtered.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (filtered.length === 0) return;
                    setActiveIndex((idx) => Math.max(idx - 1, 0));
                  } else if (event.key === "Enter" && filtered[activeIndex]) {
                    event.preventDefault();
                    choose(filtered[activeIndex].id);
                  } else if (event.key === "Escape") {
                    setOpen(false);
                    setQuery("");
                    setActiveIndex(0);
                  }
                }}
                placeholder={placeholder}
                className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">未找到匹配的物料</li>
            ) : (
              filtered.map((material, index) => (
                <li key={material.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(material.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      material.id === value || index === activeIndex ? "bg-gray-100 text-gray-900" : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium">{material.code}</span>
                    <span className="text-gray-600"> - {material.name}</span>
                    {material.spec && <span className="block text-xs text-gray-400">{material.spec}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
          {materials.length > maxVisible && !query.trim() && (
            <p className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
              仅显示前 {maxVisible} 条，输入关键词可精确筛选
            </p>
          )}
        </div>
      )}
    </div>
  );
}
