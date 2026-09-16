import { useEffect, useRef, useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type Astrologer } from '../api';

export function AstrologersPage() {
  const [astrologers, setAstrologers] = useState<Astrologer[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const dragFromIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listAstrologers();
      setAstrologers(data.astrologers);
      setPriceDrafts(
        Object.fromEntries(data.astrologers.map((a) => [a.id, String(a.creditCostPerSession)])),
      );
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

  const savePrice = async (astrologer: Astrologer) => {
    const value = Number(priceDrafts[astrologer.id]);
    if (!Number.isFinite(value) || value < 1) {
      setBanner({ kind: 'error', text: 'Price must be a positive number.' });
      return;
    }
    try {
      await api.updateAstrologerPrice(astrologer.id, value);
      setAstrologers((prev) =>
        prev.map((a) => (a.id === astrologer.id ? { ...a, creditCostPerSession: value } : a)),
      );
      setBanner({ kind: 'success', text: `${astrologer.name}'s price saved.` });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save.' });
    }
  };

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
        <h2>Astrologers &amp; session pricing</h2>
        <p className="hint">
          Drag rows to reorder — this order is what users see in the app. Name/photo come from the
          astrologer vendor and can&apos;t be edited here; the credit price is ours.
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
              <div className="price">
                <input
                  type="number"
                  min={1}
                  value={priceDrafts[a.id] ?? ''}
                  onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>credits / 10-min session</span>
                <button className="small" onClick={() => savePrice(a)}>
                  Save
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
