/** Payment routes a member can use to pay the creator for extra upload space. */
export const PAYMENT_METHODS = [
  {
    value: "visa",
    label: "Visa",
    hint: "Send the payment from your Visa card to the payout account below, then paste the transaction ID.",
  },
  {
    value: "card",
    label: "Credit / debit card",
    hint: "Mastercard, Amex or any debit card. Paste the transaction ID shown by your bank.",
  },
  {
    value: "paypal",
    label: "PayPal",
    hint: "Send the amount to the PayPal address below and paste the PayPal transaction ID.",
  },
  {
    value: "mobile_money",
    label: "Mobile money",
    hint: "Send to the mobile money number below and paste the confirmation SMS reference.",
  },
  {
    value: "bank",
    label: "Bank transfer",
    hint: "Transfer to the account below and paste the bank reference number.",
  },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;
}

export type UpgradeRequest = {
  id: string;
  user_id: string;
  amount: number;
  kind?: string;
  method: string;
  reference: string;
  note: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
};
