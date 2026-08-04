import type {
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
} from "react";

type SurfaceVariant =
  | "default"
  | "muted"
  | "glass"
  | "warning"
  | "danger"
  | "success"
  | "interactive";

type SurfaceCardOwnProps<T extends ElementType> = {
  variant?: SurfaceVariant;
  as?: T;
  className?: string;
  children: ReactNode;
};

export type SurfaceCardProps<T extends ElementType = "div"> =
  SurfaceCardOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof SurfaceCardOwnProps<T>>;

const variantClasses: Record<SurfaceVariant, string> = {
  default: "bg-[var(--surface-solid)]",
  muted: "bg-[var(--surface-muted)]",
  glass: "bg-[var(--surface)] backdrop-blur-xl",
  warning: "bg-[var(--warning-soft)]",
  danger: "bg-[var(--danger-soft)]",
  success: "bg-[var(--success-soft)]",
  interactive:
    "bg-[var(--surface-solid)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[var(--surface-hover)] hover:shadow-[var(--shadow-float)]",
};

export function SurfaceCard<T extends ElementType = "div">({
  as,
  variant = "default",
  className,
  children,
  ...rest
}: SurfaceCardProps<T>) {
  const Component = as ?? "div";
  const classes = [
    "rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-card)]",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
