import { Modal, StyleSheet, View } from 'react-native';
import { LogOut } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { colors, radii, spacing } from '@/constants/theme';

type SessionExpiredModalProps = {
  visible: boolean;
  onSignInAgain: () => void;
};

export function SessionExpiredModal({ visible, onSignInAgain }: SessionExpiredModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LogOut size={32} color={colors.primary} />
          <AppText variant="cardTitle" style={styles.title}>
            Session expired
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.message}>
            For your security, please sign in again to continue.
          </AppText>
          <Button label="Sign in again" onPress={onSignInAgain} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: { marginTop: spacing.xs, textAlign: 'center' },
  message: { textAlign: 'center' },
  button: { width: '100%', marginTop: spacing.md },
});
