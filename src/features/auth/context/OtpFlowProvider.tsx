import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

interface OtpFlowContextValue {
  phoneNumber: string;
  setPendingVerification: (phoneNumber: string) => void;
  clear: () => void;
}

const OtpFlowContext = createContext<OtpFlowContextValue | undefined>(undefined);

export function OtpFlowProvider({ children }: PropsWithChildren) {
  const [phoneNumber, setPhoneNumber] = useState('');

  const value = useMemo<OtpFlowContextValue>(
    () => ({
      phoneNumber,
      setPendingVerification: (nextPhoneNumber) => setPhoneNumber(nextPhoneNumber),
      clear: () => setPhoneNumber(''),
    }),
    [phoneNumber],
  );

  return <OtpFlowContext.Provider value={value}>{children}</OtpFlowContext.Provider>;
}

export function useOtpFlow(): OtpFlowContextValue {
  const context = useContext(OtpFlowContext);
  if (!context) throw new Error('useOtpFlow must be used within an OtpFlowProvider');
  return context;
}
