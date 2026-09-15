import { useRef } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';

import { colors, fonts, radii } from '@/constants/theme';

const CODE_LENGTH = 6;

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

export function OtpInput({ value, onChange, autoFocus }: OtpInputProps) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => value[index] ?? '');

  const handleChangeDigit = (digit: string, index: number) => {
    const sanitized = digit.replace(/[^0-9]/g, '');
    const nextValue = value.split('');
    nextValue[index] = sanitized.slice(-1) ?? '';
    onChange(nextValue.join('').slice(0, CODE_LENGTH));

    if (sanitized && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            inputRefs.current[index] = ref;
          }}
          value={digit}
          onChangeText={(text) => handleChangeDigit(text, index)}
          onKeyPress={(event) => handleKeyPress(event, index)}
          keyboardType="number-pad"
          maxLength={1}
          autoFocus={autoFocus && index === 0}
          textContentType="oneTimeCode"
          style={[styles.box, digit ? styles.boxFilled : null]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    width: 48,
    height: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boxFilled: {
    borderColor: colors.primary,
  },
});
