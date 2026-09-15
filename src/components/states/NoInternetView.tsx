import { WifiOff } from 'lucide-react-native';

import { ErrorView } from '@/components/states/ErrorView';

type NoInternetViewProps = {
  onRetry?: () => void;
};

export function NoInternetView({ onRetry }: NoInternetViewProps) {
  return (
    <ErrorView
      icon={WifiOff}
      title="No internet connection"
      message="Check your connection and try again."
      onRetry={onRetry}
      retryLabel="Try again"
    />
  );
}
