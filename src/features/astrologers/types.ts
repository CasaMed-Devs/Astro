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
}
