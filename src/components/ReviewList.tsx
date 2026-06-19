import { useState, useEffect } from 'react';
import StarRating from './StarRating';
import { API_BASE_URL } from '../lib/apiConfig';

interface Review {
  id: string;
  name: string;
  rating: number;
  body: string;
  createdAt: string;
}

interface ReviewListProps {
  product: 'kombucha' | 'sobolo' | 'salve';
}

// Replaces what used to be an SSR fetch in ProductLayout.astro's frontmatter
// (`await fetch(...)` at request time). That only worked because the page
// itself was server-rendered on every visit. Now that this page is static
// HTML on DreamHost, the fetch has to happen in the browser after the page
// loads — meaning there's necessarily a brief loading flash that didn't
// exist before. Acceptable tradeoff for not running a server on DreamHost.
export default function ReviewList({ product }: ReviewListProps) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/reviews?product=${product}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load reviews');
        return res.json();
      })
      .then((data: Review[]) => { if (!cancelled) setReviews(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [product]);

  if (error) {
    return (
      <div className="bg-cream rounded-2xl p-8 text-center text-bark/40 mb-14 italic">
        Could not load reviews right now.
      </div>
    );
  }

  if (reviews === null) {
    // Loading state — brief, since this is a same-region API call
    return (
      <div className="bg-cream rounded-2xl p-8 text-center text-bark/30 mb-14">
        Loading reviews…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="bg-cream rounded-2xl p-8 text-center text-bark/40 mb-14 italic">
        No reviews yet — be the first!
      </div>
    );
  }

  return (
    <div className="space-y-5 mb-14">
      {reviews.map(r => (
        <div key={r.id} className="bg-cream rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-semibold text-forest">{r.name}</span>
            <StarRating value={r.rating} readonly size="sm" />
          </div>
          <p className="text-bark/70 font-body text-sm leading-relaxed">{r.body}</p>
          <p className="text-bark/30 text-xs">
            {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      ))}
    </div>
  );
}
