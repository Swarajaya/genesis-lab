/**
 * Approximate reference nutrition per 100 g (edible portion, as typically eaten/cooked as noted).
 * Rounded values in line with public food-composition tables (e.g. USDA FoodData Central).
 * Real products vary; everything derived from this table is an ESTIMATE and is labelled as such.
 */
export interface FoodRef {
  name: string;
  aliases: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export const FOODS: FoodRef[] = [
  { name: "bread", aliases: ["bread", "toast", "bun", "roti", "chapati", "loaf", "baguette", "naan"], kcal: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7 },
  { name: "banana", aliases: ["banana", "plantain"], kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 },
  { name: "tomato", aliases: ["tomato", "tomatoes"], kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  { name: "cooked rice", aliases: ["rice", "cooked rice", "leftover rice"], kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
  { name: "cooked lentils", aliases: ["lentil", "lentils", "dal", "dhal", "daal"], kcal: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9 },
  { name: "potato", aliases: ["potato", "potatoes", "aloo"], kcal: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2 },
  { name: "onion", aliases: ["onion", "onions"], kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7 },
  { name: "carrot", aliases: ["carrot", "carrots"], kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2, fiber: 2.8 },
  { name: "spinach", aliases: ["spinach", "palak", "greens", "kale", "lettuce"], kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  { name: "egg", aliases: ["egg", "eggs"], kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
  { name: "milk", aliases: ["milk", "curd", "yogurt", "yoghurt", "dahi"], kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 },
  { name: "apple", aliases: ["apple", "apples", "pear"], kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 },
  { name: "cooked pasta", aliases: ["pasta", "noodles", "spaghetti", "macaroni"], kcal: 158, protein: 5.8, carbs: 31, fat: 0.9, fiber: 1.8 },
  { name: "cooked chickpeas", aliases: ["chickpea", "chickpeas", "chana", "garbanzo"], kcal: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6 },
  { name: "cooked beans", aliases: ["beans", "rajma", "kidney beans", "black beans"], kcal: 127, protein: 8.7, carbs: 23, fat: 0.5, fiber: 6.4 },
  { name: "cabbage", aliases: ["cabbage", "cauliflower", "broccoli", "gobi"], kcal: 25, protein: 1.3, carbs: 5.8, fat: 0.1, fiber: 2.5 },
  { name: "cheese", aliases: ["cheese", "paneer", "cheddar"], kcal: 300, protein: 20, carbs: 3, fat: 23, fiber: 0 },
  { name: "oats", aliases: ["oats", "oatmeal", "porridge"], kcal: 389, protein: 17, carbs: 66, fat: 7, fiber: 11 },
  { name: "cooked chicken", aliases: ["chicken"], kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
  { name: "orange", aliases: ["orange", "mandarin", "lemon", "citrus"], kcal: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4 },
  { name: "cucumber", aliases: ["cucumber", "zucchini", "courgette", "gourd", "bottle gourd", "lauki"], kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5 },
  { name: "peas", aliases: ["peas", "green peas"], kcal: 81, protein: 5.4, carbs: 14, fat: 0.4, fiber: 5.7 },
  { name: "oil", aliases: ["oil", "ghee", "butter"], kcal: 800, protein: 0, carbs: 0, fat: 90, fiber: 0 },
];

export function lookupFood(name: string): FoodRef | null {
  const n = name.toLowerCase();
  for (const f of FOODS) if (f.aliases.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(n))) return f;
  return null;
}

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface NutritionLine {
  name: string;
  grams: number;
  source: "reference-table" | "ai-estimate";
  nutrition: Per100;
}

export interface NutritionTotals extends Per100 {
  grams: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function totals(lines: NutritionLine[]): NutritionTotals {
  const t: NutritionTotals = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const l of lines) {
    const f = l.grams / 100;
    t.grams += l.grams;
    t.kcal += l.nutrition.kcal * f;
    t.protein += l.nutrition.protein * f;
    t.carbs += l.nutrition.carbs * f;
    t.fat += l.nutrition.fat * f;
    t.fiber += l.nutrition.fiber * f;
  }
  return { grams: round1(t.grams), kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fiber: round1(t.fiber) };
}

/** Indicative: roughly 2.5 kg CO2e is associated with each kg of food wasted. Shown as an estimate only. */
export const CO2E_PER_KG_FOOD_WASTE = 2.5;
