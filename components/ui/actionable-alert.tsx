import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconBadge, IconBadgeColor } from "./icon-badge";
import { ArrowRight } from "lucide-react";

export interface ActionableAlertProps {
  indicatorColor?: "amber" | "rose" | "blue" | "emerald" | "purple";
  badgeColor?: IconBadgeColor;
  icon: React.ReactNode;
  title: string;
  description: string;
  meta?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

const indicatorStyles: Record<string, string> = {
  amber: "border-l-amber-500",
  rose: "border-l-rose-500",
  blue: "border-l-sky-500",
  emerald: "border-l-emerald-500",
  purple: "border-l-purple-500",
};

export function ActionableAlert({
  indicatorColor = "amber",
  badgeColor = "amber",
  icon,
  title,
  description,
  meta,
  actionLabel = "Revisar →",
  actionHref,
  onAction,
  className,
}: ActionableAlertProps) {
  const content = (
    <div
      className={cn(
        "flex items-center justify-between gap-4 p-3.5 sm:p-4 rounded-xl border border-stone-200/70 dark:border-zinc-800/80 bg-stone-50/60 dark:bg-zinc-900/30 border-l-4 transition-all hover:bg-stone-100/60 dark:hover:bg-zinc-900/60",
        indicatorStyles[indicatorColor] || "border-l-amber-500",
        className
      )}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <IconBadge color={badgeColor} size="md">
          {icon}
        </IconBadge>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
              {title}
            </h4>
            {meta && (
              <span className="text-[11px] font-medium text-stone-600 dark:text-zinc-400">
                · {meta}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-700 dark:text-zinc-300 font-medium line-clamp-1 mt-0.5">
            {description}
          </p>
        </div>
      </div>

      <div className="shrink-0 flex items-center">
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 text-xs font-bold text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white group px-2 py-1 rounded-lg hover:bg-stone-200/50 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <span>{actionLabel}</span>
          </Link>
        ) : onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 text-xs font-bold text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white group px-2 py-1 rounded-lg hover:bg-stone-200/50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );

  return content;
}
