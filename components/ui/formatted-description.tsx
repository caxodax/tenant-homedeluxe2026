import React from 'react';

interface FormattedDescriptionProps {
  description?: string | null;
  className?: string;
}

export function FormattedDescription({ description, className = '' }: FormattedDescriptionProps) {
  if (!description || !description.trim()) {
    return null;
  }

  const rawLines = description.trim().split(/\r?\n/);

  // Agrupamos líneas en párrafos o listas con viñetas
  type Block =
    | { type: 'bullet'; items: string[] }
    | { type: 'paragraph'; text: string };

  const blocks: Block[] = [];
  let currentBullets: string[] = [];

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      blocks.push({ type: 'bullet', items: [...currentBullets] });
      currentBullets = [];
    }
  };

  const bulletRegex = /^[\s]*[•\-\*]\s+(.*)$/;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }

    const bulletMatch = trimmed.match(bulletRegex);
    if (bulletMatch) {
      currentBullets.push(bulletMatch[1]);
    } else {
      flushBullets();
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  }
  flushBullets();

  // Helper para renderizar negritas simples **texto** sin librerías pesadas (Ponytail 0-deps)
  const renderInline = (str: string) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-extrabold text-stone-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className={`space-y-2 text-stone-600 dark:text-zinc-300 text-xs sm:text-sm leading-relaxed ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === 'bullet') {
          return (
            <ul key={i} className="space-y-1.5 my-1 pl-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-1.5 rounded-full bg-stone-700 dark:bg-zinc-300 mt-2 shrink-0"
                    style={{ backgroundColor: 'var(--tenant-primary, currentColor)' }}
                  />
                  <span className="flex-1">{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-stone-700 dark:text-zinc-300">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
