import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type DisputeData, type UserDetail } from '../api';
import { formatDate, formatDateTime, formatInputDate, todayInputValue } from '../format';

type Banner = { kind: 'error' | 'success'; lines: string[] } | null;

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong.';
}

function BannerView({ banner }: { banner: Banner }) {
  if (!banner) return null;
  return (
    <div className={banner.kind === 'error' ? 'error-banner' : 'success-banner'}>
      {banner.lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

interface ActionInput {
  phoneNumber: string;
  date: string;
  credits: number;
}

/**
 * The shared shape of Give / Reset / Expire: fill the form, Submit looks the
 * user up and shows exactly what is about to change, and only Confirm
 * performs it — so an admin always sees whose account they are touching.
 */
function SubscriptionActionForm({
  title,
  hint,
  dateLabel,
  withCredits = false,
  danger = false,
  describe,
  run,
}: {
  title: string;
  hint: string;
  dateLabel: string;
  withCredits?: boolean;
  danger?: boolean;
  /** Plain-language lines telling the admin what Confirm will do to this user. */
  describe: (user: UserDetail, input: ActionInput) => string[];
  /** Performs the action; resolves with the lines of the success message. */
  run: (input: ActionInput) => Promise<string[]>;
}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [date, setDate] = useState('');
  const [credits, setCredits] = useState('');
  const [pendingUser, setPendingUser] = useState<UserDetail | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const input: ActionInput = { phoneNumber: phoneNumber.trim(), date, credits: Number(credits) };

  const validate = (): string | null => {
    if (!input.phoneNumber) return 'User number is required.';
    if (!date) return 'Date is required.';
    if (date < todayInputValue()) return 'The date cannot be in the past.';
    if (withCredits) {
      if (credits.trim() === '') return 'Credits are required.';
      if (!Number.isInteger(input.credits) || input.credits < 0) return 'Credits must be a whole number, 0 or more.';
    }
    return null;
  };

  const handleSubmit = async () => {
    setBanner(null);
    const problem = validate();
    if (problem) {
      setBanner({ kind: 'error', lines: [problem] });
      return;
    }

    setBusy(true);
    try {
      setPendingUser(await api.lookupUser(input.phoneNumber));
    } catch (err) {
      setBanner({ kind: 'error', lines: [errorText(err)] });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const lines = await run(input);
      setBanner({ kind: 'success', lines });
      setPhoneNumber('');
      setDate('');
      setCredits('');
    } catch (err) {
      setBanner({ kind: 'error', lines: [errorText(err)] });
    } finally {
      setPendingUser(null);
      setBusy(false);
    }
  };

  return (
    <>
      <BannerView banner={banner} />
      <div className="card">
        <h2>{title}</h2>
        <div className="field-row">
          <label>User number</label>
          <input
            type="text"
            placeholder="9876543210"
            value={phoneNumber}
            disabled={pendingUser !== null}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
        </div>
        <div className="field-pair">
          <div className="field-row">
            <label>{dateLabel}</label>
            <input
              type="date"
              min={todayInputValue()}
              value={date}
              disabled={pendingUser !== null}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {withCredits ? (
            <div className="field-row">
              <label>Credits to add</label>
              <input
                type="number"
                min={0}
                step={1}
                value={credits}
                disabled={pendingUser !== null}
                onChange={(e) => setCredits(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <p className="hint">{hint}</p>

        {pendingUser ? (
          <div className="confirm-box">
            <div className="confirm-title">Please confirm</div>
            <div className="detail-row">
              <span className="label">User</span>
              <span>
                {pendingUser.name ?? 'No name'} · {pendingUser.phoneNumber}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Subscription now</span>
              <span>
                {pendingUser.mandate.status}
                {pendingUser.mandate.adminGrantExpiresAt
                  ? ` (given by admin until ${formatDate(pendingUser.mandate.adminGrantExpiresAt)})`
                  : ''}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Credits now</span>
              <span>{pendingUser.credits}</span>
            </div>
            <ul>
              {describe(pendingUser, input).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="button-row">
              <button className={danger ? 'danger' : 'primary'} onClick={handleConfirm} disabled={busy}>
                {busy ? 'Working…' : 'Confirm'}
              </button>
              <button className="small" onClick={() => setPendingUser(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Checking user…' : 'Submit'}
          </button>
        )}
      </div>
    </>
  );
}

const isToday = (date: string) => date === todayInputValue();
const hasPaidSubscription = (user: UserDetail) =>
  user.mandate.status === 'active' && !user.mandate.adminGrantExpiresAt;

function GiveSubscription() {
  return (
    <SubscriptionActionForm
      title="Give subscription"
      dateLabel="Valid until"
      withCredits
      hint="The subscription stays active until the end of this date (India time), then turns off by itself. Credits are added on top of what the user already has."
      describe={(user, { date, credits }) =>
        hasPaidSubscription(user)
          ? [
              'This user already has a paid subscription, so it will not be changed.',
              `Only credits will be added: ${user.credits} + ${credits} = ${user.credits + credits}.`,
            ]
          : [
              `Subscription will be active until ${formatInputDate(date)}.`,
              `Credits: ${user.credits} + ${credits} = ${user.credits + credits}.`,
            ]
      }
      run={async ({ phoneNumber, date, credits }) => {
        const result = await api.giveSubscription(phoneNumber, date, credits);
        return [
          result.subscriptionApplied
            ? 'Subscription successfully activated for the user.'
            : 'User already had a paid subscription — credits added, subscription left as it was.',
          `Previous balance: ${result.previousCredits} credits`,
          `Added credits: +${result.addedCredits} credits`,
          `New balance: ${result.newCredits} credits`,
        ];
      }}
    />
  );
}

function ResetSubscription() {
  return (
    <SubscriptionActionForm
      title="Reset subscription"
      dateLabel="Reset on"
      danger
      hint="Puts the user back to a brand-new state. Today's date resets right now; a future date resets automatically on that day."
      describe={(user, { date }) => [
        isToday(date) ? 'This happens right now.' : `This will happen automatically on ${formatInputDate(date)}.`,
        'Subscription goes back to "none" and any auto-debit is cancelled at Razorpay.',
        `Credits will be set to 0 (currently ${user.credits}).`,
        'The user can take the Rs.1 trial again.',
        'Profile, chats, kundali and payment history are not touched.',
        'This cannot be undone.',
      ]}
      run={async ({ phoneNumber, date }) => {
        const response = await api.resetSubscription(phoneNumber, date);
        if (response.scheduled) return [`Reset scheduled for ${formatDate(response.scheduledFor)}.`];
        return [
          'Subscription has been successfully reset.',
          `Credits removed: ${response.result.previousCredits}`,
          response.result.autoDebitCancelled ? 'Auto-debit was cancelled at Razorpay.' : 'There was no auto-debit to cancel.',
        ];
      }}
    />
  );
}

function ExpireSubscription() {
  return (
    <SubscriptionActionForm
      title="Expire subscription"
      dateLabel="Expire on"
      danger
      hint="Ends an active subscription. Today's date expires it right now; a future date expires it automatically on that day."
      describe={(user, { date }) => [
        isToday(date) ? 'This happens right now.' : `This will happen automatically on ${formatInputDate(date)}.`,
        'The subscription becomes inactive and the user loses premium access.',
        'Any auto-debit is cancelled at Razorpay, so the user will not be charged again.',
        `Credits stay as they are (${user.credits}).`,
        'This cannot be undone — the user would have to subscribe again.',
      ]}
      run={async ({ phoneNumber, date }) => {
        const response = await api.expireSubscription(phoneNumber, date);
        if (response.scheduled) return [`Expiry scheduled for ${formatDate(response.scheduledFor)}.`];
        return [
          'Subscription has been successfully expired.',
          response.result.autoDebitCancelled ? 'Auto-debit was cancelled at Razorpay.' : 'There was no auto-debit to cancel.',
        ];
      }}
    />
  );
}

function DisputeDataView() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [data, setData] = useState<DisputeData | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setBanner(null);
    setData(null);
    if (!phoneNumber.trim()) {
      setBanner({ kind: 'error', lines: ['User number is required.'] });
      return;
    }

    setLoading(true);
    try {
      setData(await api.getDisputeData(phoneNumber.trim()));
    } catch (err) {
      setBanner({ kind: 'error', lines: [errorText(err)] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BannerView banner={banner} />
      <div className="card">
        <h2>Get dispute data</h2>
        <div className="field-row">
          <label>User number</label>
          <input
            type="text"
            placeholder="9876543210"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <p className="hint">
          Shows every payment for this user — trial, monthly subscription, top-ups, kundali report, failed
          payments — and any credits given by an admin.
        </p>
        <button className="primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Fetching…' : 'Submit'}
        </button>
      </div>

      {data ? (
        <div className="card">
          <h2>
            {data.user.name ?? 'No name'} · {data.user.phoneNumber} · subscription {data.user.mandateStatus} ·{' '}
            {data.user.credits} credits now
          </h2>
          {data.records.length === 0 ? (
            <p className="hint">No payments or credit grants found for this user.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Subscription ID</th>
                    <th>Subscription type</th>
                    <th>Created at</th>
                    <th className="num">Payment deducted</th>
                    <th className="num">Credits</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record.id}>
                      <td className="mono">{record.id}</td>
                      <td>{record.name ?? '—'}</td>
                      <td>{record.phoneNumber}</td>
                      <td className="mono">{record.subscriptionId ?? '—'}</td>
                      <td>{record.subscriptionType}</td>
                      <td>{formatDateTime(record.createdAt)}</td>
                      <td className="num">₹{record.paymentDeducted}</td>
                      <td className="num">{record.credits}</td>
                      <td className={record.status === 'failed' ? 'failed' : ''} title={record.failureReason ?? undefined}>
                        {record.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

const SECTIONS = [
  { id: 'give', label: 'Give subscription', view: GiveSubscription },
  { id: 'reset', label: 'Reset subscription', view: ResetSubscription },
  { id: 'expire', label: 'Expire subscription', view: ExpireSubscription },
  { id: 'dispute', label: 'Get dispute data', view: DisputeDataView },
] as const;

export function AccessSettingsPage() {
  const [activeId, setActiveId] = useState<(typeof SECTIONS)[number]['id']>('give');
  const ActiveView = SECTIONS.find((section) => section.id === activeId)!.view;

  return (
    <Layout wide={activeId === 'dispute'}>
      <div className="tabs">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            className={section.id === activeId ? 'tab active' : 'tab'}
            onClick={() => setActiveId(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      <ActiveView />
    </Layout>
  );
}
