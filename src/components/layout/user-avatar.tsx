import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-orange-500",
  "bg-sky-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-rose-600",
  "bg-amber-600",
] as const;

export function getUserInitial(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "川";
  return Array.from(source)[0]?.toUpperCase() || "川";
}

export function getUserAvatarColor(userId?: string | null) {
  const hash = Array.from(userId || "dachuan").reduce(
    (value, character) => (value * 31 + character.codePointAt(0)!) >>> 0,
    0,
  );
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

type UserAvatarProps = {
  email?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  userId?: string | null;
};

export function UserAvatar({
  email,
  name,
  size = "md",
  userId,
}: UserAvatarProps) {
  return (
    <span
      aria-label={`${name || email || "用户"}的头像`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm ring-2 ring-white/80 dark:ring-white/10",
        getUserAvatarColor(userId),
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base",
      )}
      role="img"
    >
      {getUserInitial(name, email)}
    </span>
  );
}
