import { StyleSheet, View } from 'react-native';
import { AlertTriangle, LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { colors, spacing } from '@/constants/theme';

type ErrorViewProps = {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorView({
  icon: Icon = AlertTriangle,
  title = 'Something went wrong',
  message = 'Please try again in a moment.',
  onRetry,
  retryLabel = 'Retry',
}: ErrorViewProps) {
  return (
    <View style={styles.container}>
      <Icon size={40} color={colors.danger} />
      <AppText variant="cardTitle" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.message}>
        {message}
      </AppText>
      {onRetry ? (
        <Button
          label={retryLabel}
          onPress={onRetry}
          variant="secondary"
          style={styles.retryButton}
        />
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
  retryButton: { marginTop: spacing.md, minWidth: 140 },
});
