import { CATEGORY_LABELS, type Category } from "@travel/shared";

const ICONS: Record<Category, { emoji: string; bg: string }> = {
  adventure: { emoji: "🎢", bg: "bg-orange-100" },
  attraction: { emoji: "📸", bg: "bg-sky-100" },
  museum: { emoji: "🖼️", bg: "bg-violet-100" },
  nature: { emoji: "🌳", bg: "bg-emerald-100" },
  cafe: { emoji: "☕", bg: "bg-amber-100" },
  restaurant: { emoji: "🍽️", bg: "bg-rose-100" },
  nightlife: { emoji: "🍸", bg: "bg-fuchsia-100" },
  shopping: { emoji: "🛍️", bg: "bg-pink-100" },
  other: { emoji: "📍", bg: "bg-slate-100" },
};

export function CategoryIcon({ category, size = "md" }: { category: Category; size?: "sm" | "md" }) {
  const { emoji, bg } = ICONS[category];
  const box = size === "sm" ? "size-7 text-sm" : "size-9 text-base";
  return (
    <span role="img" aria-label={CATEGORY_LABELS[category]} className={`flex shrink-0 items-center justify-center rounded-lg ${bg} ${box}`}>
      {emoji}
    </span>
  );
}
