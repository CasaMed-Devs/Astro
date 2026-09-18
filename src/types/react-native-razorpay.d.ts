declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    key: string;
    // Either order_id (one-time payment) or subscription_id (real
    // auto-recurring subscription) must be provided, not both.
    order_id?: string;
    subscription_id?: string;
    amount?: number;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: { email?: string; contact?: string; name?: string };
    theme?: { color?: string };
  }

  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature: string;
  }

  export interface RazorpayErrorResponse {
    code: number;
    description: string;
  }

  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResponse>;
  };

  export default RazorpayCheckout;
}
