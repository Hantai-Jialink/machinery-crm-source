"use client";

import Image from "next/image";
import { ChevronDown, RotateCcw, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import petAvatar from "./assets/pet-avatar.png";

type ChatPanelProps = {
  onClose: () => void;
  onRestorePet?: () => void;
};

export function ChatPanel({ onClose, onRestorePet }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messages: never[] = [];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInput("");
  }

  return (
    <section
      aria-label="大川 Agent 聊天面板"
      className="fixed inset-x-4 bottom-4 z-[60] flex h-[min(34rem,calc(100dvh-2rem))] flex-col overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-[0_24px_60px_rgba(17,24,39,0.22)] sm:left-auto sm:right-4 sm:w-[380px] lg:right-6"
    >
      <header className="flex items-center justify-between border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-orange-100">
            <Image src={petAvatar} alt="大川 Agent 桌宠" className="h-full w-full object-contain" priority />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">大川 Agent</p>
            <p className="text-xs text-orange-600">智能助手 · 即将接入</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onRestorePet && (
            <button
              type="button"
              onClick={onRestorePet}
              aria-label="恢复桌宠"
              className="inline-flex size-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="收起 Agent 聊天面板"
            className="inline-flex size-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <ChevronDown className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-white to-orange-50/40 p-4">
        {messages.length === 0 && (
          <div className="m-auto flex max-w-[15rem] flex-col items-center text-center">
            <div className="mb-3 flex size-16 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-orange-100">
              <Image src={petAvatar} alt="" className="h-full w-full object-contain" />
            </div>
            <p className="text-sm font-medium text-gray-800">Agent 接入中...</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">聊天能力将在第二阶段开放</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-orange-100 bg-white p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1.5 focus-within:border-orange-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-100">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入消息（第二阶段接入）"
            aria-label="输入给 Agent 的消息"
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
          <button
            type="submit"
            aria-label="发送消息"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ee7d2c] text-white transition-colors hover:bg-[#d9691a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}
