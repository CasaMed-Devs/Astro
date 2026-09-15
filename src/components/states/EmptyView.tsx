import { StyleSheet, View } from 'react-native';
import { Inbox, LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { colors, spacing } from '@/constants/theme';

type EmptyViewProps = {
  icon?: LucideIcon;
  title: string;
  message?: string;
};

export function EmptyView({ icon: Icon = Inbox, title, message }: EmptyViewProps) {
  return (
    <View style={styles.container}>
      <Icon size={40} color={colors.textMuted} />
      <AppText variant="cardTitle" style={styles.title}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color={colors.textSecondary} style={styles.message}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center' },
});
