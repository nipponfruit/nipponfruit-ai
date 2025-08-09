// app/api/fruit-rules/route.ts
import { NextResponse } from "next/server";
import rawRules from "@/data/fruit_rules.json";

type RuleLite = {
  sku: string;
  name: string;
  category?: string;
};

export async function GET() {
  const rules = (rawRules as any[]).map((r) => ({
    sku: String(r.sku),
    name: String(r.name),
    category: r.category ? String(r.category) : undefined,
  })) as RuleLite[];

  // カテゴリ → 名前 の順で表示が安定するよう整列
  rules.sort((a, b) => {
    const ca = (a.category || "").localeCompare(b.category || "");
    if (ca !== 0) return ca;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ rules });
}