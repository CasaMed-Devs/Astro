import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import {
  api,
  ApiError,
  type CreditPricingValue,
  type PriceValue,
  type PricingUpdate,
  type TopUpConfigValue,
} from '../api';

function PriceForm({
  title,
  hint,
  buttonLabel,
  value,
  onSave,
}: {
  title: string;
  hint?: string;
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
      {hint ? <p className="hint">{hint}</p> : null}
      <button className="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : buttonLabel}
      </button>
    </div>
  );
}

function CreditPriceForm({
  value,
  onSave,
}: {
  value: CreditPricingValue;
  onSave: (value: CreditPricingValue) => Promise<void>;
}) {
  const [rupeesPerCredit, setRupeesPerCredit] = useState(
    value.rupeesPerCredit != null ? String(value.rupeesPerCredit) : '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRupeesPerCredit(value.rupeesPerCredit != null ? String(value.rupeesPerCredit) : '');
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ rupeesPerCredit: rupeesPerCredit ? Number(rupeesPerCredit) : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>Price of 1 credit</h2>
      <div className="field-row">
        <label>Rupees per credit</label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={rupeesPerCredit}
          onChange={(e) => setRupeesPerCredit(e.target.value)}
        />
      </div>
      <p className="hint">
        The one number behind all credit economics. Every chat message costs exactly 1 credit, for
        every astrologer. A top-up of Rs.X grants X ÷ (this number) credits; the Rs.299 auto-debit
        grants 299 ÷ (this number) credits. Changes apply instantly to everyone.
      </p>
      <button className="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save credit price'}
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
  const [presetAmounts, setPresetAmounts] = useState(
    value.presetAmounts ? value.presetAmounts.join(', ') : '',
  );
  const [currency, setCurrency] = useState(value.currency ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMinAmount(value.minAmount != null ? String(value.minAmount) : '');
    setMaxAmount(value.maxAmount != null ? String(value.maxAmount) : '');
    setPresetAmounts(value.presetAmounts ? value.presetAmounts.join(', ') : '');
    setCurrency(value.currency ?? '');
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
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
        Amounts are whole Rupees. Minimum/maximum are enforced on both the app and the server — the
        wallet balance is redeemable only inside the app, never withdrawable or transferable.
      </p>
      <button className="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save top-up settings'}
      </button>
    </div>
  );
}

export function PricingPage() {
  const [creditPricing, setCreditPricing] = useState<CreditPricingValue>({});
  const [trialAmount, setTrialAmount] = useState<PriceValue>({});
  const [subscriptionAmount, setSubscriptionAmount] = useState<PriceValue>({});
  const [report, setReport] = useState<PriceValue>({});
  const [topUp, setTopUp] = useState<TopUpConfigValue>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPricing()
      .then((data) => {
        setCreditPricing(data.creditPricing);
        setTrialAmount(data.trialAmount);
        setSubscriptionAmount(data.subscriptionAmount);
        setReport(data.report);
        setTopUp(data.topUp);
      })
      .catch((err) => setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to load.' }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (update: PricingUpdate) => {
    try {
      await api.updatePricing(update);
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
          <CreditPriceForm value={creditPricing} onSave={(v) => save({ creditPricing: v })} />
          <PriceForm
            title="Trial (mandate registration charge)"
            hint="Charged once when a new user sets up auto-debit. Grants 5 free credits the first time only. The day-2 auto-debit is then the subscription amount below."
            buttonLabel="Save trial amount"
            value={trialAmount}
            onSave={(v) => save({ trialAmount: v })}
          />
          <PriceForm
            title="Subscription (recurring auto-debit)"
            hint="Charged automatically on day 2 after the trial, then every 30 days, against the user's saved card/UPI mandate. Also what 'Subscribe now' charges immediately."
            buttonLabel="Save subscription amount"
            value={subscriptionAmount}
            onSave={(v) => save({ subscriptionAmount: v })}
          />
          <PriceForm
            title="Kundali report (one-time unlock)"
            buttonLabel="Save report price"
            value={report}
            onSave={(v) => save({ report: v })}
          />
          <TopUpForm value={topUp} onSave={(v) => save({ topUp: v })} />
        </>
      )}
    </Layout>
  );
}
