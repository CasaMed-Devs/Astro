const DEFAULT_CREDIT_COST = 1;

/** Persona API has no pricing concept — credit cost per message is our own business rule. */
const CREDIT_COST_OVERRIDES: Record<string, number> = {};

export function getCreditCost(profileId: string): number {
  return CREDIT_COST_OVERRIDES[profileId] ?? DEFAULT_CREDIT_COST;
}
