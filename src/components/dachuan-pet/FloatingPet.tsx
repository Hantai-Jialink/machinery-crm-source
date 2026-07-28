"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import petAvatar from "./assets/pet-avatar.png";
import petMain from "./assets/pet-main.png";
import petWave from "./assets/pet-wave.png";
import styles from "./FloatingPet.module.css";

export function FloatingPet() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isPetHidden, setIsPetHidden] = useState(false);
  const [isGreeting, setIsGreeting] = useState(false);
  const isSuperAdmin = session?.user.role === "SUPER_ADMIN";

  if (status === "loading" || !isSuperAdmin) return null;

  if (isOpen) {
    return (
      <ChatPanel
        onClose={() => setIsOpen(false)}
        onRestorePet={isPetHidden ? () => {
          setIsPetHidden(false);
          setIsOpen(false);
        } : undefined}
      />
    );
  }

  if (isPetHidden) {
    return (
      <div className="fixed bottom-4 right-4 z-[60] sm:right-4 lg:right-6">
        <div className="absolute inset-0 rounded-full bg-orange-300/40 blur-md motion-safe:animate-[pulse_3s_ease-in-out_infinite]" />
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="打开大川 Agent 聊天面板"
          className="relative flex size-[72px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-orange-50 shadow-[0_12px_28px_rgba(238,125,44,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          <Image src={petAvatar} alt="大川 Agent 悬浮头像" className="h-full w-full object-contain" priority />
        </button>
      </div>
    );
  }

  return (
    <div className={`group fixed bottom-2 right-3 z-[60] sm:right-4 lg:right-6 ${styles.petFloat}`}>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setIsGreeting(true)}
        onMouseLeave={() => setIsGreeting(false)}
        onFocus={() => setIsGreeting(true)}
        onBlur={() => setIsGreeting(false)}
        aria-label="打开大川 Agent 聊天面板"
        className={`group relative block w-[152px] sm:w-[176px] ${styles.petCard} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2`}
      >
        <Image
          src={petMain}
          alt="大川 Agent 桌宠"
          className={`h-auto w-full mix-blend-multiply transition-opacity duration-200 ${isGreeting ? "opacity-0" : "opacity-100"}`}
          priority
        />
        <Image
          src={petWave}
          alt=""
          className={`absolute inset-0 h-full w-full mix-blend-multiply transition-opacity duration-200 ${isGreeting ? "opacity-100" : "opacity-0"}`}
        />
      </button>
      <button
        type="button"
        onClick={() => setIsPetHidden(true)}
        aria-label="隐藏桌宠，显示悬浮头像"
        className="absolute right-0 top-4 inline-flex size-7 items-center justify-center rounded-full border border-orange-100 bg-white/95 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-gray-900 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 group-hover:opacity-100"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
