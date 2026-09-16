import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Input } from '@/components/forms/Input';
import { spacing } from '@/constants/theme';
import type { RequiredInput } from '@/features/astrologers/types';

interface RequiredInputFormProps {
  inputs: RequiredInput[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function RequiredInputForm({ inputs, values, onChange }: RequiredInputFormProps) {
  if (inputs.length === 0) return null;

  return (
    <View style={styles.container}>
      {inputs.map((input) => (
        <View key={input.key} style={styles.field}>
          <AppText variant="label">{input.label}</AppText>
          <Input
            value={values[input.key] ?? ''}
            onChangeText={(text) => onChange(input.key, text)}
            placeholder={input.example}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  field: { gap: spacing.xs },
});
