import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type DisputeData, type UserDataCounts, type UserDetail } from '../api';
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
  unlockKundali: boolean;
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
  withKundali = false,
  danger = false,
  describe,
  run,
}: {
  title: string;
  hint: string;
  dateLabel: string;
  withCredits?: boolean;
  /** Shows the "allow kundali report" checkbox. */
  withKundali?: boolean;
  danger?: boolean;
  /** Plain-language lines telling the admin what Confirm will do to this user. */
  describe: (user: UserDetail, input: ActionInput) => string[];
  /** Performs the action; resolves with the lines of the success message. */
  run: (input: ActionInput) => Promise<string[]>;
}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [date, setDate] = useState('');
  const [credits, setCredits] = useState('');
  const [unlockKundali, setUnlockKundali] = useState(false);
  const [pendingUser, setPendingUser] = useState<UserDetail | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const input: ActionInput = { phoneNumber: phoneNumber.trim(), date, credits: Number(credits), unlockKundali };

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
      setUnlockKundali(false);
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
        {withKundali ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={unlockKundali}
              disabled={pendingUser !== null}
              onChange={(e) => setUnlockKundali(e.target.checked)}
            />
            Allow Kundali report access
          </label>
        ) : null}
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

function describeKundali(user: UserDetail, unlockKundali: boolean): string {
  if (user.kundaliUnlocked) return 'Kundali report: this user already has access.';
  return unlockKundali
    ? 'Kundali report will be unlocked for this user, permanently.'
    : 'Kundali report stays locked.';
}

function GiveSubscription() {
  return (
    <SubscriptionActionForm
      title="Give subscription"
      dateLabel="Valid until"
      withCredits
      withKundali
      hint="The subscription stays active until the end of this date (India time), then turns off by itself. Credits are added on top of what the user already has. Kundali report access, once given, is permanent and does not end with the subscription."
      describe={(user, { date, credits, unlockKundali }) => [
        ...(hasPaidSubscription(user)
          ? [
              'This user already has a paid subscription, so it will not be changed.',
              `Only credits will be added: ${user.credits} + ${credits} = ${user.credits + credits}.`,
            ]
          : [
              `Subscription will be active until ${formatInputDate(date)}.`,
              `Credits: ${user.credits} + ${credits} = ${user.credits + credits}.`,
            ]),
        describeKundali(user, unlockKundali),
      ]}
      run={async ({ phoneNumber, date, credits, unlockKundali }) => {
        const result = await api.giveSubscription(phoneNumber, date, credits, unlockKundali);
        return [
          result.subscriptionApplied
            ? 'Subscription successfully activated for the user.'
            : 'User already had a paid subscription — credits added, subscription left as it was.',
          `Previous balance: ${result.previousCredits} credits`,
          `Added credits: +${result.addedCredits} credits`,
          `New balance: ${result.newCredits} credits`,
          ...(result.kundaliUnlocked ? ['Kundali report access given.'] : []),
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

/** A row's payment only has an invoice when real money moved for it — matches the backend's own rule. */
const isInvoiceable = (record: DisputeData['records'][number]) =>
  record.status === 'paid' && record.paymentDeducted > 0;

function DisputeDataView() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [data, setData] = useState<DisputeData | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadInvoice = async (recordId: string) => {
    if (!phoneNumber.trim()) return;
    setBanner(null);
    setDownloadingId(recordId);
    try {
      const html = await api.getDisputeInvoiceHtml(phoneNumber.trim(), recordId);
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const opened = window.open(blobUrl, '_blank');
      if (!opened) setBanner({ kind: 'error', lines: ['Please allow pop-ups to view the invoice.'] });
    } catch (err) {
      setBanner({ kind: 'error', lines: [errorText(err)] });
    } finally {
      setDownloadingId(null);
    }
  };

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
                    <th>Invoice</th>
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
                      <td>
                        {isInvoiceable(record) ? (
                          <button
                            className="small"
                            onClick={() => handleDownloadInvoice(record.id)}
                            disabled={downloadingId === record.id}
                          >
                            {downloadingId === record.id ? 'Opening…' : 'View invoice'}
                          </button>
                        ) : (
                          '—'
                        )}
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

/** Same normalising as the backend: spaces/dashes dropped, a bare 10-digit number gets +91. */
function normalizePhone(value: string): string {
  const compact = value.replace(/[\s-]/g, '');
  return /^\d{10}$/.test(compact) ? `+91${compact}` : compact;
}

const DATA_LABELS: Array<[keyof UserDataCounts, string]> = [
  ['profileDocs', 'Account, profile and kundali report'],
  ['chats', 'Chats'],
  ['subscriptions', 'Subscriptions'],
  ['transactions', 'Transactions'],
  ['payments', 'Payment records'],
  ['paymentOrders', 'Payment orders'],
  ['scheduledActions', 'Scheduled resets/expiries'],
];

function DeleteAccount() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pending, setPending] = useState<{ user: UserDetail; counts: UserDataCounts } | null>(null);
  const [confirmNumber, setConfirmNumber] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const confirmed = pending !== null && normalizePhone(confirmNumber) === pending.user.phoneNumber;

  const handleSubmit = async () => {
    setBanner(null);
    if (!phoneNumber.trim()) {
      setBanner({ kind: 'error', lines: ['User number is required.'] });
      return;
    }

    setBusy(true);
    try {
      const [user, counts] = await Promise.all([
        api.lookupUser(phoneNumber.trim()),
        api.previewUserDeletion(phoneNumber.trim()),
      ]);
      setPending({ user, counts });
    } catch (err) {
      setBanner({ kind: 'error', lines: [errorText(err)] });
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setPending(null);
    setConfirmNumber('');
  };

  const handleDelete = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await api.deleteUser(pending.user.phoneNumber, confirmNumber.trim());
      setBanner({
        kind: 'success',
        lines: [
          `Account ${pending.user.phoneNumber} has been permanently deleted.`,
          ...DATA_LABELS.filter(([key]) => result.deleted[key] > 0).map(
            ([key, label]) => `${label}: ${result.deleted[key]} deleted`,
          ),
          result.subscriptionsCancelled > 0
            ? 'Auto-debit was cancelled at Razorpay.'
            : 'There was no auto-debit to cancel.',
        ],
      });
      setPhoneNumber('');
      handleCancel();
    } catch (err) {
      setBanner({ kind: 'error', lines: [errorText(err)] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BannerView banner={banner} />
      <div className="card">
        <h2>Delete account</h2>
        <div className="field-row">
          <label>User number</label>
          <input
            type="text"
            placeholder="9876543210"
            value={phoneNumber}
            disabled={pending !== null}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !pending && handleSubmit()}
          />
        </div>
        <p className="hint">
          Permanently deletes the user and everything linked to them — profile, kundali, chats, subscriptions,
          payments and transactions. Any auto-debit is cancelled at Razorpay first. Dispute data and invoices for
          this user will no longer be available.
        </p>

        {pending ? (
          <div className="confirm-box">
            <div className="confirm-title">This cannot be undone</div>
            <div className="detail-row">
              <span className="label">User</span>
              <span>
                {pending.user.name ?? 'No name'} · {pending.user.phoneNumber}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Subscription now</span>
              <span>{pending.user.mandate.status}</span>
            </div>
            <div className="detail-row">
              <span className="label">Credits now</span>
              <span>{pending.user.credits}</span>
            </div>
            {DATA_LABELS.map(([key, label]) => (
              <div className="detail-row" key={key}>
                <span className="label">{label}</span>
                <span>{pending.counts[key]}</span>
              </div>
            ))}
            <div className="field-row" style={{ marginTop: 14 }}>
              <label>Type the user number again to confirm</label>
              <input
                type="text"
                placeholder={pending.user.phoneNumber}
                value={confirmNumber}
                autoFocus
                onChange={(e) => setConfirmNumber(e.target.value)}
              />
            </div>
            <div className="button-row">
              <button className="danger" onClick={handleDelete} disabled={busy || !confirmed}>
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button className="small" onClick={handleCancel} disabled={busy}>
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

const SECTIONS = [
  { id: 'give', label: 'Give subscription', view: GiveSubscription },
  { id: 'reset', label: 'Reset subscription', view: ResetSubscription },
  { id: 'expire', label: 'Expire subscription', view: ExpireSubscription },
  { id: 'dispute', label: 'Get dispute data', view: DisputeDataView },
  { id: 'delete', label: 'Delete account', view: DeleteAccount },
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
