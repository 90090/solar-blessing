import { useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' };

export default function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div
      className="flex items-center gap-0.5"
      role={readonly ? 'img' : 'radiogroup'}
      aria-label={`Rating: ${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map(star => {
        const filled = readonly ? star <= value : star <= (hovered || value);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(0)}
            className={[
              sizes[size],
              'transition-all duration-150 focus:outline-none',
              readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
              filled ? 'text-sun' : 'text-bark/20',
            ].join(' ')}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
