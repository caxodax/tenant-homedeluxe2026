import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2 text-sm text-stone-950 dark:text-white font-medium placeholder:text-stone-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 dark:focus:border-lime-400 transition-all disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
