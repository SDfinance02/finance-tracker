import type { CategorizationRule, Category, TransactionType } from '../types';

const keywords: Array<{ words: string[]; category: string; type?: TransactionType }> = [
  { words: ['delhaize', 'colruyt', 'carrefour', 'aldi', 'lidl', 'okay', 'ah '], category: 'Groceries' },
  { words: ['restaurant', 'brasserie', 'cafe', 'coffee', 'starbucks', 'pain quotidien', 'uber eats', 'deliveroo'], category: 'Dining' },
  { words: ['shell', 'esso', 'q8', 'totalenergies', 'texaco'], category: 'Fuel' },
  { words: ['netflix', 'spotify', 'icloud', 'apple.com/bill', 'disney', 'youtube premium'], category: 'Subscriptions' },
  { words: ['telenet', 'proximus', 'orange belgium'], category: 'Telecom' },
  { words: ['booking.com', 'airbnb', 'hotel', 'ryanair', 'brussels airlines', 'lufthansa'], category: 'Travel' },
  { words: ['apotheek', 'pharmacy', 'newpharma', 'farmaline'], category: 'Health' },
  { words: ['salary', 'loon', 'salaire', 'wedde', 'uz gent', 'ugent'], category: 'Salary', type: 'income' },
];

export function suggestCategory(description: string, amount: number, categories: Category[], rules: CategorizationRule[]) {
  const normalized = description.toLowerCase();
  for (const rule of rules.filter((r) => r.active).sort((a, b) => b.priority - a.priority)) {
    if (normalized.includes(rule.pattern.toLowerCase())) {
      return { categoryId: rule.category_id, type: rule.transaction_type, confidence: 0.98, reason: `Rule: ${rule.pattern}` };
    }
  }
  for (const item of keywords) {
    if (item.words.some((w) => normalized.includes(w))) {
      const cat = categories.find((c) => c.name.toLowerCase() === item.category.toLowerCase());
      if (cat) return { categoryId: cat.id, type: item.type ?? (amount >= 0 ? 'income' : 'expense'), confidence: 0.82, reason: `Keyword: ${item.category}` };
    }
  }
  const fallback = categories.find((c) => c.name === (amount >= 0 ? 'Other income' : 'Other'));
  return { categoryId: fallback?.id ?? null, type: amount >= 0 ? 'income' as const : 'expense' as const, confidence: 0.3, reason: 'Fallback' };
}
