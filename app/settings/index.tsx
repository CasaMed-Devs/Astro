import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { colors, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Back
        </AppText>
      </Pressable>

      <AppText variant="displayMd" style={styles.title}>
        Settings
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.xl },
});
