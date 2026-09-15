import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { EmptyView } from '@/components/states/EmptyView';
import { PersonaCard } from '@/features/astrologers/components/PersonaCard';
import { SpecialtyFilterChip } from '@/features/astrologers/components/SpecialtyFilterChip';
import { astrologerPersonas } from '@/features/astrologers/config/personas';
import { SPECIALTY_LABELS, type PersonaSpecialty } from '@/features/astrologers/types';
import { colors, spacing } from '@/constants/theme';

const FILTERS: { label: string; value: PersonaSpecialty | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: SPECIALTY_LABELS.kundali, value: 'kundali' },
  { label: SPECIALTY_LABELS.tarot, value: 'tarot' },
  { label: SPECIALTY_LABELS.palmistry, value: 'palmistry' },
  { label: SPECIALTY_LABELS.numerology, value: 'numerology' },
];

export default function AstrologersScreen() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PersonaSpecialty | 'all'>('all');

  const filteredPersonas = useMemo(() => {
    return astrologerPersonas.filter((persona) => {
      const matchesFilter = filter === 'all' || persona.specialties.includes(filter);
      const matchesQuery = persona.name.toLowerCase().includes(query.trim().toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [query, filter]);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="displayMd">Astrologer</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Chat with an AI astrologer, pay only in credits you use
        </AppText>
      </View>

      <View style={styles.searchWrap}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          leftAccessory={<Search size={18} color={colors.textSecondary} />}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTERS}
        keyExtractor={(item) => item.value}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <SpecialtyFilterChip
            label={item.label}
            selected={filter === item.value}
            onPress={() => setFilter(item.value)}
          />
        )}
      />

      <FlatList
        data={filteredPersonas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => (
          <PersonaCard persona={item} onPress={() => router.push(`/astrologer/${item.id}`)} />
        )}
        ListEmptyComponent={
          <EmptyView title="No astrologers found" message="Try a different search or filter." />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs, marginTop: spacing.md },
  searchWrap: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  filterRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
});
