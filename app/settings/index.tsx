import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Bell, FileText, ShieldCheck, Trash2 } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { colors, radii, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

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

      <View style={styles.row}>
        <Bell size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.rowLabel}>
          Push notifications
        </AppText>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          trackColor={{ true: colors.primary }}
        />
      </View>

      <Pressable style={styles.row}>
        <FileText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.rowLabel}>
          Terms of service
        </AppText>
      </Pressable>

      <Pressable style={styles.row}>
        <ShieldCheck size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.rowLabel}>
          Privacy policy
        </AppText>
      </Pressable>

      <Pressable style={styles.row} onPress={() => router.push('/account/delete')}>
        <Trash2 size={20} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.rowLabel}>
          Delete account
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rowLabel: { flex: 1 },
});
