// src/components/workspace/FormCardGrid.tsx
// Reusable grid that renders form cards identically in both workspaces.

import { FORM_CARDS, type FormType } from "./shared-form-cards";

interface FormCardGridProps {
  onSelect: (type: FormType) => void;
}

export function FormCardGrid({ onSelect }: FormCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FORM_CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.type}
            type="button"
            onClick={() => onSelect(card.type)}
            className={`
              group flex flex-col rounded-2xl border border-border p-5 text-left
              shadow-sm transition-all duration-150
              hover:-translate-y-0.5 hover:shadow-md
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
              ${card.accent}
            `}
          >
            {/* Icon */}
            <span
              className={`
                mb-3 inline-flex h-10 w-10 shrink-0 items-center justify-center
                rounded-xl transition-transform duration-150 group-hover:scale-110
                ${card.iconStyle}
              `}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>

            {/* Text */}
            <p className="font-semibold leading-snug text-foreground">
              {card.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {card.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
