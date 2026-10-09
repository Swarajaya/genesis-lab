/** Classifies free-text ingredient and meal names into procedural 3D kinds. Pure logic, no three.js. */

export type FoodKind =
  | "bread" | "tomato" | "leaf" | "banana" | "rice" | "lentil" | "carrot" | "potato" | "onion" | "egg" | "apple"
  | "orange" | "cheese" | "milk" | "pasta" | "bean" | "cucumber" | "pea" | "oat" | "chicken" | "pepper" | "mushroom" | "generic";

const RULES: [FoodKind, RegExp][] = [
  ["bread", /\b(bread|toast|bun|roti|chapati|loaf|baguette|naan|bagel|crouton|pita|tortilla|wrap)s?\b/i],
  ["tomato", /\b(tomato(es)?)\b/i],
  ["leaf", /\b(lettuce|spinach|kale|greens?|palak|cabbage|salad|arugula|rocket|basil|herbs?|cilantro|coriander|parsley|mint|chard|broccoli|cauliflower|gobi)\b/i],
  ["banana", /\b(banana|plantain)s?\b/i],
  ["rice", /\b(rice|quinoa|couscous|millet|barley)\b/i],
  ["lentil", /\b(lentils?|dal|dhal|daal)\b/i],
  ["bean", /\b(beans?|chickpeas?|chana|rajma|garbanzo)\b/i],
  ["carrot", /\b(carrots?)\b/i],
  ["potato", /\b(potato(es)?|aloo|yam|sweet potato)\b/i],
  ["onion", /\b(onions?|garlic|shallots?|leeks?)\b/i],
  ["egg", /\b(eggs?)\b/i],
  ["apple", /\b(apples?|pears?|peach(es)?|plums?|mango(es)?)\b/i],
  ["orange", /\b(oranges?|mandarins?|lemons?|limes?|citrus)\b/i],
  ["cheese", /\b(cheese|paneer|cheddar|mozzarella|feta|parmesan|tofu)\b/i],
  ["milk", /\b(milk|curd|yogh?urt|dahi|cream|kefir)\b/i],
  ["pasta", /\b(pasta|noodles?|spaghetti|macaroni|penne|fusilli|ramen)\b/i],
  ["cucumber", /\b(cucumbers?|zucchini|courgettes?|gourd|lauki|squash|pumpkin)\b/i],
  ["pea", /\b(peas?|edamame|corn|sweetcorn)\b/i],
  ["oat", /\b(oats?|oatmeal|porridge|granola|cereal|muesli)\b/i],
  ["chicken", /\b(chicken|turkey|beef|pork|lamb|fish|salmon|tuna|shrimp|prawns?|meat|sausage|bacon|ham)\b/i],
  ["pepper", /\b(peppers?|capsicum|chill?i(es)?|paprika)\b/i],
  ["mushroom", /\b(mushrooms?)\b/i],
];

export function classifyFood(name: string): FoodKind {
  for (const [kind, re] of RULES) if (re.test(name)) return kind;
  return "generic";
}

export const KIND_COLOR: Record<FoodKind, string> = {
  bread: "#d9a45c", tomato: "#e5392b", leaf: "#58b848", banana: "#f2d23c", rice: "#f4efe0", lentil: "#c8892f", carrot: "#f28a1c",
  potato: "#c9a06a", onion: "#d9b5d0", egg: "#fbf4e2", apple: "#d94a3a", orange: "#f59a1e", cheese: "#f6d36a", milk: "#f2f6fa",
  pasta: "#efd48a", bean: "#a45a3a", cucumber: "#6fb85a", pea: "#7fcf5a", oat: "#e6d3aa", chicken: "#d89a78", pepper: "#e0483a",
  mushroom: "#cdb99c", generic: "#9be86a",
};

export type MealKind = "salad" | "soup" | "toast" | "pasta" | "rice" | "porridge" | "egg" | "patty" | "plate";

const MEAL_RULES: [MealKind, RegExp][] = [
  ["toast", /\b(toast|sandwich|bruschetta|crostini|wrap|sub|panini|pizza|flatbread|french toast)\b/i],
  ["salad", /\b(salad|panzanella|slaw|chaat|tabbouleh|bowl salad)\b/i],
  ["soup", /\b(soup|stew|curry|dal|dhal|daal|broth|chowder|ribollita|khichdi|khichri|sambar|chili|gravy|sauce)\b/i],
  ["pasta", /\b(pasta|spaghetti|noodles?|macaroni|penne|lasagna|ramen)\b/i],
  ["rice", /\b(rice|pilaf|pulao|biryani|risotto|fried rice|bibimbap|grain bowl|jollof|paella)\b/i],
  ["porridge", /\b(porridge|oat|oatmeal|pudding|smoothie|parfait|granola|overnight|banana bowl|breakfast bowl)\b/i],
  ["egg", /\b(omelet+e?|frittata|scramble|shakshuka|egg|tortilla espa)\b/i],
  ["patty", /\b(patty|patties|fritter|cutlet|pancake|cake|croquette|tikki|kebab|burger|latke|rosti|bake)\b/i],
];

export function classifyMeal(name: string, description = ""): MealKind {
  for (const [kind, re] of MEAL_RULES) if (re.test(name)) return kind;
  for (const [kind, re] of MEAL_RULES) if (re.test(description)) return kind;
  return "plate";
}

/** Broth colour for soups, chosen from the ingredients that are actually in the meal. */
export function brothColor(kinds: FoodKind[]): string {
  if (kinds.includes("tomato")) return "#c4472c";
  if (kinds.includes("lentil")) return "#c99a3c";
  if (kinds.includes("leaf")) return "#5c8f3a";
  if (kinds.includes("carrot")) return "#d98a2a";
  if (kinds.includes("milk")) return "#efe6d2";
  return "#b8863f";
}

/** Small deterministic PRNG so a given meal always lays out the same way. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
