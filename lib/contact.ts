export const CONTACT_CATEGORIES = [
  { value: 'general', label: 'Pytanie ogólne' },
  { value: 'bug', label: 'Błąd techniczny' },
  { value: 'suggestion', label: 'Sugestia funkcji' },
  { value: 'pricing', label: 'Pytanie o plan lub cennik' },
  { value: 'account', label: 'Sprawa konta lub rozliczeń' },
  { value: 'partnership', label: 'Współpraca' },
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]['value'];

export const CONTACT_CATEGORY_VALUES = new Set<ContactCategory>(
  CONTACT_CATEGORIES.map((category) => category.value),
);
