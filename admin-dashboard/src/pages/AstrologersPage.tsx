import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api, ApiError, type Astrologer } from '../api';

export function AstrologersPage() {
  const [astrologers, setAstrologers] = useState<Astrologer[]>([]);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const dragFromIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listAstrologers();
      setAstrologers(data.astrologers);
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to load.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = async (toIndex: number) => {
    const fromIndex = dragFromIndex.current;
    dragFromIndex.current = null;
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === toIndex) return;

    const reordered = [...astrologers];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setAstrologers(reordered);

    try {
      await api.updateAstrologerOrder(reordered.map((a) => a.id));
      setBanner({ kind: 'success', text: 'Order saved.' });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save order.' });
    }
  };

  return (
    <Layout>
      {banner ? <div className={banner.kind === 'error' ? 'error-banner' : 'success-banner'}>{banner.text}</div> : null}
      <div className="card">
        <h2>Astrologers</h2>
        <p className="hint">
          Drag rows to reorder — this order is what users see in the app. Name/photo come from the
          astrologer vendor and can&apos;t be edited here. Every astrologer costs the same: 1 credit
          per message. The Rupee price of a credit is set globally on the{' '}
          <Link to="/pricing">Pricing page</Link>.
        </p>
        {loading ? (
          <div className="centered-loading">Loading…</div>
        ) : (
          astrologers.map((a, index) => (
            <div
              key={a.id}
              className={`astrologer-row${dragOverIndex === index ? ' drag-over' : ''}`}
              draggable
              onDragStart={() => {
                dragFromIndex.current = index;
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverIndex(index);
              }}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(index);
              }}
            >
              <span className="handle">⠿</span>
              <img
                src={a.photoUrl}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              <div className="info">
                <div className="name">{a.name}</div>
                <div className="meta">
                  {a.tagline}
                  {a.city ? ` · ${a.city}` : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
