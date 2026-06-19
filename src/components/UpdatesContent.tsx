import { useState, useEffect } from 'react';
import StarRating from './StarRating';
import { API_BASE_URL } from '../lib/apiConfig';

interface Post   { id: string; title: string; excerpt: string; body: string; createdAt: string; }
interface Event  { id: string; title: string; date: string; time: string; location: string; description: string; }
interface Review { id: string; name: string; rating: number; body: string; product: string; createdAt: string; }

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function productLabel(p: string) {
  return ({ kombucha: '🍵 Kombucha', sobolo: '🌺 Sobolo', salve: '✋ Hand Salve' } as Record<string, string>)[p] ?? p;
}

// Replaces updates.astro's old frontmatter, which ran a Promise.all of
// fetch() calls against Astro.url.origin at SSR time — that only worked
// because the page was server-rendered on every visit. Now that it's static
// HTML on DreamHost, all of that moves into the browser, targeting the
// separate Lambda API origin instead of a same-origin relative path.
export default function UpdatesContent() {
  const [posts, setPosts]     = useState<Post[] | null>(null);
  const [events, setEvents]   = useState<Event[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      safeFetch<Post[]>(`${API_BASE_URL}/api/updates/posts`, []),
      safeFetch<Event[]>(`${API_BASE_URL}/api/updates/events`, []),
      safeFetch<Review[]>(`${API_BASE_URL}/api/reviews?product=kombucha`, []),
      safeFetch<Review[]>(`${API_BASE_URL}/api/reviews?product=sobolo`, []),
      safeFetch<Review[]>(`${API_BASE_URL}/api/reviews?product=salve`, []),
    ]).then(([p, e, kombucha, sobolo, salve]) => {
      if (cancelled) return;
      setPosts(p);
      setEvents(e);
      setReviews(
        [...kombucha, ...sobolo, ...salve]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 6)
      );
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* ── Events / Where to Find Us ── */}
      <section className="section-pad bg-white">
        <div className="container-xl">
          <h2 className="font-display text-4xl text-forest mb-3">Where to Find Us</h2>
          <p className="text-bark/50 font-body mb-10">Come say hi at one of our upcoming events.</p>

          {events === null ? (
            <div className="rounded-2xl border-2 border-dashed border-forest/15 p-14 text-center">
              <p className="text-bark/30 italic font-body">Loading events…</p>
            </div>
          ) : events.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(ev => (
                <div key={ev.id} className="card overflow-hidden">
                  <div className="bg-forest px-6 py-4">
                    <p className="text-sun font-semibold text-sm font-body">{ev.date}</p>
                    <h3 className="font-display text-xl text-white mt-1">{ev.title}</h3>
                  </div>
                  <div className="p-6 space-y-3">
                    {ev.time && (
                      <div className="flex items-center gap-2 text-sm text-bark/60 font-body">
                        <span>🕐</span><span>{ev.time}</span>
                      </div>
                    )}
                    {ev.location && (
                      <div className="flex items-center gap-2 text-sm text-bark/60 font-body">
                        <span>📍</span><span>{ev.location}</span>
                      </div>
                    )}
                    {ev.description && (
                      <p className="text-bark/50 text-sm font-body leading-relaxed pt-1 border-t border-forest/[0.08]">
                        {ev.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border-2 border-dashed border-forest/15 flex flex-col items-center justify-center p-8 text-center gap-3">
                <span className="text-3xl">📅</span>
                <p className="text-bark/30 italic text-sm font-body">More events coming soon…</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-forest/15 p-14 text-center space-y-3">
              <span className="text-4xl block">📅</span>
              <p className="text-bark/30 italic font-body">No upcoming events right now — check back soon!</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Blog Posts ── */}
      <section className="section-pad bg-cream">
        <div className="container-xl">
          <h2 className="font-display text-4xl text-forest mb-3">Recent Updates</h2>
          <p className="text-bark/50 font-body mb-10">News and announcements from Solar Blessing.</p>

          {posts === null ? (
            <div className="rounded-2xl border-2 border-dashed border-forest/15 p-14 text-center">
              <p className="text-bark/30 italic font-body">Loading updates…</p>
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-6">
              {posts.map((post, i) => (
                <div
                  key={post.id}
                  className={`card overflow-hidden grid ${i % 2 === 0 ? 'md:grid-cols-[220px_1fr]' : 'md:grid-cols-[1fr_220px]'}`}
                >
                  <div className={`h-44 md:h-auto flex items-center justify-center text-5xl bg-sun/15 ${i % 2 !== 0 ? 'md:order-last' : ''}`}>
                    📰
                  </div>
                  <div className="p-8 space-y-3">
                    <p className="text-sun font-semibold text-xs font-body tracking-wide uppercase">{fmtDate(post.createdAt)}</p>
                    <h3 className="font-display text-2xl text-forest">{post.title}</h3>
                    {post.excerpt && (
                      <p className="text-bark/60 leading-relaxed text-sm font-body">{post.excerpt}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-forest/15 p-14 text-center space-y-3">
              <span className="text-4xl block">📰</span>
              <p className="text-bark/30 italic font-body">No posts yet — check back soon!</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Reviews ── */}
      <section className="section-pad bg-white">
        <div className="container-xl">
          <h2 className="font-display text-4xl text-forest mb-3">What People Are Saying</h2>
          <p className="text-bark/50 font-body mb-10">Real reviews from our customers.</p>

          {reviews === null ? (
            <div className="rounded-2xl border-2 border-dashed border-earth/20 p-14 text-center">
              <p className="text-bark/30 italic font-body">Loading reviews…</p>
            </div>
          ) : reviews.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.map(r => (
                <div key={r.id} className="bg-sun/10 rounded-2xl p-7 space-y-4 flex flex-col">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <StarRating value={r.rating} readonly size="sm" />
                    <span className="text-xs text-bark/40 font-body bg-white px-2 py-0.5 rounded-full">
                      {productLabel(r.product)}
                    </span>
                  </div>
                  <p className="font-body italic text-bark/75 leading-relaxed text-sm flex-1">"{r.body}"</p>
                  <div className="flex items-center justify-between pt-2 border-t border-sun/20">
                    <p className="font-semibold text-forest text-sm">— {r.name}</p>
                    <p className="text-xs text-bark/30 font-body">{fmtDate(r.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-earth/20 p-14 text-center space-y-3">
              <span className="text-4xl block">⭐</span>
              <p className="text-bark/30 italic font-body">No reviews yet — leave one on a product page!</p>
            </div>
          )}

          <div className="flex flex-wrap gap-4 mt-10 pt-8 border-t border-forest/[0.08]">
            <p className="text-bark/50 text-sm font-body self-center">Leave a review:</p>
            <a href="/kombucha#reviews" className="btn-outline text-sm py-2 px-5">Kombucha</a>
            <a href="/sobolo#reviews"   className="btn-outline text-sm py-2 px-5">Sobolo</a>
            <a href="/salve#reviews"    className="btn-outline text-sm py-2 px-5">Hand Salve</a>
          </div>
        </div>
      </section>
    </>
  );
}
