import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type PriceValue } from '../api';

function PriceForm({
  title,
  buttonLabel,
  value,
  onSave,
}: {
  title: string;
  buttonLabel: string;
  value: PriceValue;
  onSave: (value: PriceValue) => Promise<void>;
}) {
  const [amount, setAmount] = useState(value.amount != null ? String(value.amount) : '');
  const [currency, setCurrency] = useState(value.currency ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAmount(value.amount != null ? String(value.amount) : '');
    setCurrency(value.currency ?? '');
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        amount: amount ? Number(amount) : undefined,
        currency: currency || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="field-pair">
        <div className="field-row">
          <label>Amount (smallest currency unit, e.g. paise)</label>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Currency</label>
          <input type="text" placeholder="INR" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
      </div>
      <button className="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : buttonLabel}
      </button>
    </div>
  );
}

export function PricingPage() {
  const [subscription, setSubscription] = useState<PriceValue>({});
  const [report, setReport] = useState<PriceValue>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPricing()
      .then((data) => {
        setSubscription(data.subscription);
        setReport(data.report);
      })
      .catch((err) => setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to load.' }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (key: 'subscription' | 'report', value: PriceValue) => {
    try {
      await api.updatePricing({ [key]: value });
      setBanner({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save.' });
    }
  };

  return (
    <Layout>
      {banner ? <div className={banner.kind === 'error' ? 'error-banner' : 'success-banner'}>{banner.text}</div> : null}
      {loading ? (
        <div className="centered-loading">Loading…</div>
      ) : (
        <>
          <PriceForm
            title="Astro101 Plus (subscription)"
            buttonLabel="Save subscription price"
            value={subscription}
            onSave={(v) => save('subscription', v)}
          />
          <PriceForm
            title="Kundali report (one-time unlock)"
            buttonLabel="Save report price"
            value={report}
            onSave={(v) => save('report', v)}
          />
        </>
      )}
    </Layout>
  );
}
