import * as React from "react";
import { cn } from "@/lib/utils";

export type IconBadgeColor =
  | "emerald"
  | "amber"
  | "rose"
  | "blue"
  | "purple"
  | "stone"
  | "lime"
  | "primary";

export type IconBadgeSize = "sm" | "md" | "lg";

export interface IconBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: IconBadgeColor;
  size?: IconBadgeSize;
}

const colorStyles: Record<IconBadgeColor, string> = {
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/40",
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200/50 dark:border-sky-800/40",
  purple: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/40",
  stone: "bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300 border-stone-200/60 dark:border-zinc-700/50",
  lime: "bg-lime-50 text-lime-700 dark:bg-lime-950/40 dark:text-lime-400 border-lime-200/50 dark:border-lime-800/40",
  primary: "bg-[var(--tenant-primary)]/10 text-[var(--tenant-primary)] border-[var(--tenant-primary)]/20",
};

const sizeStyles: Record<IconBadgeSize, string> = {
  sm: "w-7 h-7 rounded-lg text-xs",
  md: "w-9 h-9 rounded-xl text-sm",
  lg: "w-11 h-11 rounded-2xl text-base",
};

export function IconBadge({
  color = "emerald",
  size = "md",
  className,
  children,
  ...props
}: IconBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center shrink-0 border transition-transform",
        colorStyles[color],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
