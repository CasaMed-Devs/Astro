import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, ReceiptText } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyView } from '@/components/states/EmptyView';
import { ErrorView } from '@/components/states/ErrorView';
import { LoadingView } from '@/components/states/LoadingView';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { formatInvoiceAmount, formatInvoiceDate } from '@/features/invoices/invoiceFormat';
import { getInvoices, invoicesQueryKey, type Invoice } from '@/services/invoice.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function InvoicesScreen() {
  const { session } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: invoicesQueryKey(session?.uid),
    queryFn: getInvoices,
    enabled: Boolean(session),
  });

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Back
        </AppText>
      </Pressable>

      <AppText variant="displayMd" style={styles.title}>
        Invoices
      </AppText>

      {isLoading ? (
        <LoadingView />
      ) : isError ? (
        <ErrorView
          title="Could not load invoices"
          message={error instanceof AppError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyView
          icon={ReceiptText}
          title="No invoices yet"
          message="Invoices for your trial and monthly subscription payments will appear here."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(invoice) => invoice.id}
          renderItem={({ item }) => <InvoiceRow invoice={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: invoice.id } })}
    >
      <View style={styles.rowText}>
        <AppText variant="cardTitle">{invoice.description}</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          {invoice.invoiceNumber} · {formatInvoiceDate(invoice.paidAt)}
        </AppText>
      </View>
      <AppText variant="cardTitle" color={colors.primary}>
        {formatInvoiceAmount(invoice.amount)}
      </AppText>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.xl },
  list: { gap: spacing.md, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  rowText: { flex: 1, gap: 2 },
});
