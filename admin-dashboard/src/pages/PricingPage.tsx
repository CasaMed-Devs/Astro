import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type PriceValue, type SubscriptionPriceValue, type TopUpConfigValue } from '../api';

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
          <label>Amount (Rupees)</label>
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

function SubscriptionPriceForm({
  value,
  onSave,
}: {
  value: SubscriptionPriceValue;
  onSave: (value: SubscriptionPriceValue) => Promise<void>;
}) {
  const [amount, setAmount] = useState(value.amount != null ? String(value.amount) : '');
  const [currency, setCurrency] = useState(value.currency ?? '');
  const [razorpayPlanId, setRazorpayPlanId] = useState(value.razorpayPlanId ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAmount(value.amount != null ? String(value.amount) : '');
    setCurrency(value.currency ?? '');
    setRazorpayPlanId(value.razorpayPlanId ?? '');
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        amount: amount ? Number(amount) : undefined,
        currency: currency || undefined,
        razorpayPlanId: razorpayPlanId || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>Astro101 Plus (subscription)</h2>
      <div className="field-pair">
        <div className="field-row">
          <label>Amount (Rupees) — for display only</label>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Currency</label>
          <input type="text" placeholder="INR" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Razorpay Plan ID (auto-recurring billing)</label>
          <input
            type="text"
            placeholder="plan_xxxxxxxxxxxxxx"
            value={razorpayPlanId}
            onChange={(e) => setRazorpayPlanId(e.target.value)}
          />
        </div>
      </div>
      <p className="hint">
        Create or change the plan (and its price) in the Razorpay Dashboard under Subscriptions →
        Plans, then paste the resulting plan_xxx ID here. The Amount/Currency fields above are only
        used to display the price in the app — the actual charge amount is whatever the Razorpay
        Plan is configured for.
      </p>
      <button className="primary" onClick={handleSave} disabled={saving}>
        Save subscription plan
      </button>
    </div>
  );
}

function TopUpForm({
  value,
  onSave,
}: {
  value: TopUpConfigValue;
  onSave: (value: TopUpConfigValue) => Promise<void>;
}) {
  const [minAmount, setMinAmount] = useState(value.minAmount != null ? String(value.minAmount) : '');
  const [maxAmount, setMaxAmount] = useState(value.maxAmount != null ? String(value.maxAmount) : '');
  const [creditsPerRupee, setCreditsPerRupee] = useState(
    value.creditsPerRupee != null ? String(value.creditsPerRupee) : '',
  );
  const [presetAmounts, setPresetAmounts] = useState(
    value.presetAmounts ? value.presetAmounts.join(', ') : '',
  );
  const [currency, setCurrency] = useState(value.currency ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMinAmount(value.minAmount != null ? String(value.minAmount) : '');
    setMaxAmount(value.maxAmount != null ? String(value.maxAmount) : '');
    setCreditsPerRupee(value.creditsPerRupee != null ? String(value.creditsPerRupee) : '');
    setPresetAmounts(value.presetAmounts ? value.presetAmounts.join(', ') : '');
    setCurrency(value.currency ?? '');
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
        creditsPerRupee: creditsPerRupee ? Number(creditsPerRupee) : undefined,
        presetAmounts: presetAmounts
          ? presetAmounts
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n) && n > 0)
          : undefined,
        currency: currency || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>Wallet top-up</h2>
      <div className="field-pair">
        <div className="field-row">
          <label>Minimum top-up (Rupees)</label>
          <input type="number" min={1} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Maximum top-up (Rupees)</label>
          <input type="number" min={1} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Credits per rupee</label>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={creditsPerRupee}
            onChange={(e) => setCreditsPerRupee(e.target.value)}
          />
        </div>
        <div className="field-row">
          <label>Preset amounts (Rupees, comma-separated)</label>
          <input
            type="text"
            placeholder="50, 100, 200, 500"
            value={presetAmounts}
            onChange={(e) => setPresetAmounts(e.target.value)}
          />
        </div>
        <div className="field-row">
          <label>Currency</label>
          <input type="text" placeholder="INR" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
      </div>
      <p className="hint">
        Amounts are in whole Rupees. Minimum/maximum are enforced on both the app and the server —
        the wallet balance is redeemable only inside the app, never withdrawable or transferable.
      </p>
      <button className="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save top-up settings'}
      </button>
    </div>
  );
}

export function PricingPage() {
  const [subscription, setSubscription] = useState<SubscriptionPriceValue>({});
  const [report, setReport] = useState<PriceValue>({});
  const [topUp, setTopUp] = useState<TopUpConfigValue>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPricing()
      .then((data) => {
        setSubscription(data.subscription);
        setReport(data.report);
        setTopUp(data.topUp);
      })
      .catch((err) => setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to load.' }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (key: 'subscription' | 'report' | 'topUp', value: PriceValue | TopUpConfigValue) => {
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
          <SubscriptionPriceForm value={subscription} onSave={(v) => save('subscription', v)} />
          <PriceForm
            title="Kundali report (one-time unlock)"
            buttonLabel="Save report price"
            value={report}
            onSave={(v) => save('report', v)}
          />
          <TopUpForm value={topUp} onSave={(v) => save('topUp', v)} />
        </>
      )}
    </Layout>
  );
}
