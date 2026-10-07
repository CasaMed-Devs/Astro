import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Card } from '@/components/cards/Card';
import { Screen } from '@/components/common/Screen';
import { ErrorView } from '@/components/states/ErrorView';
import { LoadingView } from '@/components/states/LoadingView';
import { useAuth } from '@/features/auth/context/AuthProvider';
import {
  formatInvoiceAmount,
  formatInvoiceDate,
  formatPhoneNumber,
} from '@/features/invoices/invoiceFormat';
import { getInvoiceCustomerName } from '@/features/invoices/invoiceHtml';
import { downloadInvoicePdf, shareInvoicePdf } from '@/features/invoices/invoicePdf';
import { getInvoices, invoicesQueryKey, type Invoice } from '@/services/invoice.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import { showSuccessToast } from '@/utils/toast';

type PdfAction = 'download' | 'share';

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  // Same key as the list screen, so arriving from there renders instantly
  // from cache instead of fetching again.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: invoicesQueryKey(session?.uid),
    queryFn: getInvoices,
    enabled: Boolean(session),
  });
  const invoice = data?.find((item) => item.id === id);

  return (
    <Screen scroll={Boolean(invoice)}>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Invoices
        </AppText>
      </Pressable>

      {invoice ? (
        <InvoiceDetails invoice={invoice} />
      ) : isLoading ? (
        <LoadingView />
      ) : isError ? (
        <ErrorView
          title="Could not load invoice"
          message={error instanceof AppError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : (
        <ErrorView title="Invoice not found" message="This invoice is no longer available." />
      )}
    </Screen>
  );
}

function InvoiceDetails({ invoice }: { invoice: Invoice }) {
  const [busy, setBusy] = useState<PdfAction | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const { seller } = invoice;

  const runPdfAction = async (action: PdfAction) => {
    setBusy(action);
    setPdfError(null);
    try {
      if (action === 'share') {
        await shareInvoicePdf(invoice);
      } else if ((await downloadInvoicePdf(invoice)) === 'saved') {
        showSuccessToast('Invoice saved');
      }
    } catch (err) {
      setPdfError(
        err instanceof AppError
          ? err.message
          : 'Could not create the invoice PDF. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <AppText variant="bodySmall" color={colors.textSecondary} style={styles.caps}>
            TAX INVOICE
          </AppText>
          <View style={styles.paidPill}>
            <AppText variant="bodySmall" color={PAID_GREEN} style={styles.caps}>
              PAID
            </AppText>
          </View>
        </View>
        <AppText variant="displayLg">{formatInvoiceAmount(invoice.amount)}</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          {invoice.invoiceNumber} · {formatInvoiceDate(invoice.paidAt)}
        </AppText>

        <View style={styles.divider} />

        <AppText variant="cardTitle">{seller.legalName}</AppText>
        {seller.addressLines.map((line) => (
          <AppText key={line} variant="bodySmall" color={colors.textSecondary}>
            {line}
          </AppText>
        ))}
        <AppText variant="bodySmall" color={colors.textSecondary}>
          GSTIN {seller.gstin} · {seller.state} ({seller.stateCode})
        </AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          {seller.supportEmail}
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="bodySmall" color={colors.textSecondary} style={styles.caps}>
          BILLED TO
        </AppText>
        <AppText variant="cardTitle">{getInvoiceCustomerName(invoice)}</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {formatPhoneNumber(invoice.customer.phoneNumber)}
        </AppText>

        <View style={styles.divider} />

        <AppText variant="bodySmall" color={colors.textSecondary} style={styles.caps}>
          SERVICE
        </AppText>
        <AppText variant="cardTitle">{invoice.appName}</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {invoice.description} · Delivered digitally in the app
        </AppText>
      </Card>

      <Card style={styles.card}>
        <DetailRow label="Invoice number" value={invoice.invoiceNumber} />
        <DetailRow label="Subscription type" value={invoice.description} />
        {invoice.subscriptionId ? (
          <DetailRow label="Subscription ID" value={invoice.subscriptionId} />
        ) : null}
        <DetailRow label="Subscription start" value={formatInvoiceDate(invoice.periodStart)} />
        <DetailRow label="Subscription end" value={formatInvoiceDate(invoice.periodEnd)} />
        <DetailRow label="Payment date" value={formatInvoiceDate(invoice.paidAt)} />
        <DetailRow label="Payment status" value="Paid" />
        <DetailRow label="Payment ID" value={invoice.paymentId} />
        <DetailRow label="SAC" value={`${invoice.sac.code} · ${invoice.sac.description}`} />

        <View style={styles.divider} />

        <DetailRow label="Taxable value" value={formatInvoiceAmount(invoice.taxableValue)} />
        <DetailRow
          label={`CGST @ ${invoice.halfGstRatePercent}%`}
          value={formatInvoiceAmount(invoice.cgst)}
        />
        <DetailRow
          label={`SGST @ ${invoice.halfGstRatePercent}%`}
          value={formatInvoiceAmount(invoice.sgst)}
        />
        <View style={styles.totalRow}>
          <AppText variant="cardTitle" color={colors.onGradientText}>
            Total paid
          </AppText>
          <AppText variant="cardTitle" color={colors.onGradientText}>
            {formatInvoiceAmount(invoice.amount)}
          </AppText>
        </View>
      </Card>

      {pdfError ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {pdfError}
        </AppText>
      ) : null}

      <Button
        label="Download invoice (PDF)"
        onPress={() => runPdfAction('download')}
        loading={busy === 'download'}
        disabled={busy !== null}
      />
      <Button
        label="Share invoice"
        variant="secondary"
        onPress={() => runPdfAction('share')}
        loading={busy === 'share'}
        disabled={busy !== null}
        style={styles.shareButton}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="bodySmall" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="body" selectable style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

// Same "paid" green as the PDF's status pill (see invoiceHtml.ts); the app
// theme has no success colour of its own.
const PAID_GREEN = '#1E7B3A';
const PAID_GREEN_BG = '#E6F4EA';

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  card: { gap: spacing.xs, marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  caps: { letterSpacing: 1 },
  paidPill: {
    backgroundColor: PAID_GREEN_BG,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.xs,
  },
  detailValue: { flex: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.textPrimary,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  error: { marginBottom: spacing.md },
  shareButton: { marginTop: spacing.md, marginBottom: spacing.xxl },
});
