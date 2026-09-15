import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/states/LoadingView';
import { ErrorView } from '@/components/states/ErrorView';
import { Card } from '@/components/cards/Card';
import { zodiacSigns } from '@/constants/zodiac';
import { fetchDailyHoroscope } from '@/services/horoscope.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function HoroscopeScreen() {
  const [selectedSign, setSelectedSign] = useState(zodiacSigns[0].id);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['horoscope', selectedSign],
    queryFn: () => fetchDailyHoroscope(selectedSign),
  });

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="displayMd">Daily Horoscope</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Pick your sign for today&apos;s reading
        </AppText>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={zodiacSigns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.signRow}
        renderItem={({ item }) => {
          const selected = item.id === selectedSign;
          return (
            <View
              style={[styles.signChip, selected && styles.signChipSelected]}
              onTouchEnd={() => setSelectedSign(item.id)}
            >
              <AppText style={styles.signSymbol}>{item.symbol}</AppText>
              <AppText
                variant="caption"
                color={selected ? colors.onGradientText : colors.textSecondary}
              >
                {item.label}
              </AppText>
            </View>
          );
        }}
      />

      <View style={styles.content}>
        {isLoading ? (
          <LoadingView message="Reading the stars..." />
        ) : isError ? (
          <ErrorView
            title="Couldn't load your horoscope"
            message={error instanceof AppError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : data ? (
          <Card>
            <AppText variant="cardTitle" style={styles.cardTitle}>
              {zodiacSigns.find((s) => s.id === selectedSign)?.label} · Today
            </AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {data.content}
            </AppText>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs, marginTop: spacing.md },
  signRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  signChip: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  signChipSelected: { backgroundColor: colors.primary },
  signSymbol: { fontSize: 20 },
  content: { paddingHorizontal: spacing.xl, marginTop: spacing.lg, flex: 1 },
  cardTitle: { marginBottom: spacing.sm },
});
