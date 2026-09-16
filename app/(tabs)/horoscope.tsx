import { useState, useRef } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Sun, Star, Heart, Gem } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { LoadingView } from '@/components/states/LoadingView';
import { ErrorView } from '@/components/states/ErrorView';
import { zodiacSigns } from '@/constants/zodiac';
import { fetchDailyHoroscope } from '@/services/horoscope.service';
import { colors, fonts, radii, spacing, shadows } from '@/constants/theme';
import { AppError } from '@/utils/errors';

const { width: SCREEN_W } = Dimensions.get('window');

// Extended zodiac metadata — lucky color and number per sign
const ZODIAC_META: Record<string, { dates: string; element: string; elementColor: string; luckyColor: string; luckyNumber: number; compatibility: string }> = {
  aries:       { dates: 'Mar 21 – Apr 19', element: 'Fire', elementColor: '#E8633A', luckyColor: 'Crimson', luckyNumber: 9, compatibility: 'Leo' },
  taurus:      { dates: 'Apr 20 – May 20', element: 'Earth', elementColor: '#6BAF6E', luckyColor: 'Emerald', luckyNumber: 6, compatibility: 'Virgo' },
  gemini:      { dates: 'May 21 – Jun 20', element: 'Air', elementColor: '#7EC8E3', luckyColor: 'Yellow', luckyNumber: 5, compatibility: 'Libra' },
  cancer:      { dates: 'Jun 21 – Jul 22', element: 'Water', elementColor: '#6B9FD4', luckyColor: 'Silver', luckyNumber: 2, compatibility: 'Pisces' },
  leo:         { dates: 'Jul 23 – Aug 22', element: 'Fire', elementColor: '#E8633A', luckyColor: 'Gold', luckyNumber: 1, compatibility: 'Aries' },
  virgo:       { dates: 'Aug 23 – Sep 22', element: 'Earth', elementColor: '#6BAF6E', luckyColor: 'Forest', luckyNumber: 5, compatibility: 'Taurus' },
  libra:       { dates: 'Sep 23 – Oct 22', element: 'Air', elementColor: '#7EC8E3', luckyColor: 'Rose', luckyNumber: 6, compatibility: 'Gemini' },
  scorpio:     { dates: 'Oct 23 – Nov 21', element: 'Water', elementColor: '#6B9FD4', luckyColor: 'Maroon', luckyNumber: 8, compatibility: 'Cancer' },
  sagittarius: { dates: 'Nov 22 – Dec 21', element: 'Fire', elementColor: '#E8633A', luckyColor: 'Purple', luckyNumber: 3, compatibility: 'Leo' },
  capricorn:   { dates: 'Dec 22 – Jan 19', element: 'Earth', elementColor: '#6BAF6E', luckyColor: 'Brown', luckyNumber: 8, compatibility: 'Virgo' },
  aquarius:    { dates: 'Jan 20 – Feb 18', element: 'Air', elementColor: '#7EC8E3', luckyColor: 'Violet', luckyNumber: 4, compatibility: 'Libra' },
  pisces:      { dates: 'Feb 19 – Mar 20', element: 'Water', elementColor: '#6B9FD4', luckyColor: 'Aqua', luckyNumber: 7, compatibility: 'Scorpio' },
};

const TODAY = new Date().toLocaleDateString('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function HoroscopeScreen() {
  const [selectedSign, setSelectedSign] = useState(zodiacSigns[0].id);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['horoscope', selectedSign],
    queryFn: () => fetchDailyHoroscope(selectedSign),
  });

  const handleSelectSign = (id: string) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    setSelectedSign(id);
  };

  const selectedData = zodiacSigns.find((s) => s.id === selectedSign)!;
  const meta = ZODIAC_META[selectedSign]!;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header gradient banner ── */}
      <LinearGradient
        colors={['#2A1A0E', '#3D2210', colors.backgroundFrom]}
        style={styles.heroBanner}
      >
        <View style={styles.heroTop}>
          <View>
            <AppText style={styles.heroLabel}>DAILY READING</AppText>
            <AppText style={styles.heroTitle}>Horoscope</AppText>
          </View>
          <View style={styles.sparkleCircle}>
            <Star size={18} color={colors.primary} fill={colors.primary} />
          </View>
        </View>
        <AppText style={styles.heroDate}>{TODAY}</AppText>
      </LinearGradient>

      {/* ── Sign selector ── */}
      <View style={styles.selectorSection}>
        <AppText variant="label" color={colors.textMuted} style={styles.selectorLabel}>
          SELECT YOUR SIGN
        </AppText>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={zodiacSigns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.signRow}
          renderItem={({ item }) => {
            const selected = item.id === selectedSign;
            return (
              <Pressable
                onPress={() => handleSelectSign(item.id)}
                style={({ pressed }) => [
                  styles.signChip,
                  selected && styles.signChipSelected,
                  pressed && styles.signChipPressed,
                ]}
              >
                {selected && (
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                )}
                <AppText style={[styles.signSymbol, selected && styles.signSymbolSelected]}>
                  {item.symbol}
                </AppText>
                <AppText
                  style={[
                    styles.signLabel,
                    { color: selected ? '#fff' : colors.textMuted },
                  ]}
                >
                  {item.label.slice(0, 3)}
                </AppText>
              </Pressable>
            );
          }}
        />
      </View>

      {/* ── Selected sign hero card ── */}
      <Animated.View style={[styles.signHeroCard, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['#2A1A0E', '#1E1208']}
          style={styles.signHeroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Decorative glyph */}
          <AppText style={styles.signHeroGlyph}>{selectedData.symbol}</AppText>

          <View style={styles.signHeroInfo}>
            <AppText style={styles.signHeroName}>{selectedData.label}</AppText>
            <AppText style={styles.signHeroDates}>{meta.dates}</AppText>
            <View style={[styles.elementBadge, { borderColor: meta.elementColor + '60' }]}>
              <View style={[styles.elementDot, { backgroundColor: meta.elementColor }]} />
              <AppText style={[styles.elementText, { color: meta.elementColor }]}>
                {meta.element}
              </AppText>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Reading content ── */}
      <View style={styles.readingSection}>
        {isLoading ? (
          <View style={styles.loadingCard}>
            <LoadingView message="Consulting the stars…" />
          </View>
        ) : isError ? (
          <ErrorView
            title="Couldn't load your horoscope"
            message={error instanceof AppError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : data ? (
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* Reading card */}
            <View style={styles.readingCard}>
              <View style={styles.readingCardHeader}>
                <View style={styles.readingPulse}>
                  <Sun size={13} color={colors.primary} />
                </View>
                <AppText style={styles.readingCardLabel}>TODAY&apos;S COSMIC READING</AppText>
              </View>

              <AppText style={styles.readingTitle}>
                {selectedData.label}&apos;s Message
              </AppText>

              {/* Divider */}
              <View style={styles.divider} />

              <AppText style={styles.readingText}>{data.content}</AppText>
            </View>

            {/* Lucky cards row */}
            <View style={styles.luckyRow}>
              <LuckyCard
                label="Lucky Color"
                value={meta.luckyColor}
                gradientColors={['#C9A84C', '#E8C96B']}
                Icon={Gem}
              />
              <LuckyCard
                label="Number"
                value={String(meta.luckyNumber)}
                gradientColors={['#7B6ECC', '#A99EE0']}
                Icon={Star}
              />
              <LuckyCard
                label="Pair Well"
                value={meta.compatibility}
                gradientColors={['#C9637B', '#E08C9E']}
                Icon={Heart}
              />
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ScrollView>
  );
}

type LuckyCardProps = {
  label: string;
  value: string;
  gradientColors: [string, string];
  Icon: React.ComponentType<{ size: number; color: string }>;
};

function LuckyCard({ label, value, gradientColors, Icon }: LuckyCardProps) {
  return (
    <View style={styles.luckyCard}>
      <LinearGradient
        colors={gradientColors}
        style={styles.luckyIconCircle}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Icon size={16} color="#fff" />
      </LinearGradient>
      <AppText style={styles.luckyValue}>{value}</AppText>
      <AppText style={styles.luckyLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.backgroundFrom },
  scrollContent: { paddingBottom: 100 },

  // Hero banner
  heroBanner: {
    paddingTop: 60,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.primary,
  },
  heroTitle: {
    fontFamily: 'CormorantGaramond_700Bold',
    fontSize: 42,
    lineHeight: 50,
    color: '#FFF8EE',
    marginTop: 2,
  },
  heroDate: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: 'rgba(255,248,238,0.5)',
    marginTop: spacing.sm,
  },
  sparkleCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(178,95,10,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(178,95,10,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sign selector
  selectorSection: { marginTop: -spacing.lg },
  selectorLabel: {
    letterSpacing: 2,
    fontSize: 9,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  signRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  signChip: {
    width: 58,
    height: 68,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  signChipSelected: {
    borderColor: colors.primary,
  },
  signChipPressed: { opacity: 0.75 },
  signSymbol: { fontSize: 22, color: colors.textSecondary },
  signSymbolSelected: { color: '#fff' },
  signLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    letterSpacing: 0.5,
  },

  // Selected sign hero card
  signHeroCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    borderRadius: radii.lg,
    ...shadows.card,
  },
  signHeroGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
    minHeight: 120,
  },
  signHeroGlyph: {
    fontSize: 56,
    opacity: 0.9,
    lineHeight: 64,
  
  },
  signHeroInfo: { flex: 1, gap: spacing.xs, borderRadius: 20, },
  signHeroName: {
    fontFamily: 'CormorantGaramond_700Bold',
    fontSize: 32,
    color: '#FFF8EE',
    lineHeight: 38,
  },
  signHeroDates: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: 'rgba(255,248,238,0.5)',
  },
  elementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  elementDot: { width: 6, height: 6, borderRadius: 3 },
  elementText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },

  // Reading section
  readingSection: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xxl,
    ...shadows.card,
  },
  readingCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  readingPulse: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(178,95,10,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readingCardLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.primary,
  },
  readingTitle: {
    fontFamily: 'CormorantGaramond_700Bold',
    fontSize: 24,
    color: colors.textPrimary,
    lineHeight: 30,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  readingText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    lineHeight: 26,
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },

  // Lucky cards
  luckyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  luckyCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 6,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  luckyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  luckyValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  luckyLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
