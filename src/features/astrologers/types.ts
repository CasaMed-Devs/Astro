export interface RequiredInput {
  key: string;
  label: string;
  example: string;
  required: boolean;
}

export interface AstrologerProfile {
  id: string;
  category: string;
  name: string;
  tagline: string;
  method: string;
  city: string;
  age: number;
  photoUrl: string;
  greeting: string;
  openers: string[];
  requiredInputs: RequiredInput[];
  /** Credits deducted from a free-tier user's balance per user message sent to this persona. */
  creditCostPerMessage: number;
}
