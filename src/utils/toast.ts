import { ToastAndroid, Platform } from 'react-native';

export function showSuccessToast(message: string): void {
  if (Platform.OS !== 'android') return;
  ToastAndroid.show(message, ToastAndroid.SHORT);
}

export function showErrorToast(message: string): void {
  if (Platform.OS !== 'android') return;
  ToastAndroid.show(message, ToastAndroid.SHORT);
}
