import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

interface OtpFlowContextValue {
  phoneNumber: string;
  identificationToken: string;
  otp: string;
  setPendingVerification: (phoneNumber: string, identificationToken: string, otp: string) => void;
  clear: () => void;
}

const OtpFlowContext = createContext<OtpFlowContextValue | undefined>(undefined);

export function OtpFlowProvider({ children }: PropsWithChildren) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [identificationToken, setIdentificationToken] = useState('');
  const [otp, setOtp] = useState('');

  const value = useMemo<OtpFlowContextValue>(
    () => ({
      phoneNumber,
      identificationToken,
      otp,
      setPendingVerification: (nextPhoneNumber, nextIdentificationToken, nextOtp) => {
        setPhoneNumber(nextPhoneNumber);
        setIdentificationToken(nextIdentificationToken);
        setOtp(nextOtp);
      },
      clear: () => {
        setPhoneNumber('');
        setIdentificationToken('');
        setOtp('');
      },
    }),
    [phoneNumber, identificationToken, otp],
  );

  return <OtpFlowContext.Provider value={value}>{children}</OtpFlowContext.Provider>;
}

export function useOtpFlow(): OtpFlowContextValue {
  const context = useContext(OtpFlowContext);
  if (!context) throw new Error('useOtpFlow must be used within an OtpFlowProvider');
  return context;
}
