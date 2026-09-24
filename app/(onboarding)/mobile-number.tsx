import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { useOtpFlow } from '@/features/auth/context/OtpFlowProvider';
import { sendOtp } from '@/services/auth.service';
import { colors, spacing } from '@/constants/theme';
import { isValidIndianMobileNumber, toE164 } from '@/validation/phone';
import { AppError } from '@/utils/errors';

export default function MobileNumberScreen() {
  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setPendingVerification } = useOtpFlow();

  const handleSendOtp = async () => {
    setError(null);

    if (!isValidIndianMobileNumber(localNumber)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    try {
      const phoneNumber = toE164(localNumber);
      const { identificationToken, otp } = await sendOtp(phoneNumber);
      setPendingVerification(phoneNumber, identificationToken, otp);
      router.push('/(onboarding)/otp');
    } catch (err) {
      setError(
        err instanceof AppError ? err.message : 'Could not send the code. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.brand}>
        <Image
          source={require('../../assets/images/android-icon-foreground.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <AppText variant="wordmark" color={colors.primary}>
          Astro108
        </AppText>
      </View>

      <View style={styles.header}>
        <AppText variant="displayMd">Enter your mobile number</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          We&apos;ll send a 6-digit OTP to verify it&apos;s really you.
        </AppText>
      </View>

      <View style={styles.field}>
        <AppText variant="label">Mobile number</AppText>
        <Input
          keyboardType="phone-pad"
          maxLength={10}
          value={localNumber}
          onChangeText={setLocalNumber}
          placeholder="1234567890"
          leftAccessory={
            <AppText variant="label" color={colors.textPrimary}>
              +91
            </AppText>
          }
          testID="mobile-number-input"
        />
        {error ? (
          <AppText variant="bodySmall" color={colors.danger}>
            {error}
          </AppText>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button
          label="Send OTP"
          onPress={handleSendOtp}
          loading={submitting}
          testID="send-otp-button"
        />
        <AppText variant="caption" color={colors.textSecondary} style={styles.terms}>
          By continuing you agree to our Terms and Privacy Policy. Consultations are for guidance
          purposes only.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  logo: { width: 150, height: 150 },
  header: { gap: spacing.sm, marginTop: spacing.xl },
  field: { gap: spacing.sm, marginTop: spacing.xxl },
  footer: { marginTop: 'auto', marginBottom: spacing.xl, gap: spacing.md },
  terms: { textAlign: 'center' },
});
