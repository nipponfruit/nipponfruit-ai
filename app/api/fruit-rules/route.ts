// app/api/fruit-rules/route.ts
import { NextResponse } from "next/server";
import rawRules from "@/data/fruit_rules.json";

type RuleLite = {
  sku: string;
  name: string;
  category?: string;
};

type RawRule = { sku: unknown; name: unknown; category?: unknown };

export async function GET() {
  // JSONを安全に型付けして整形
  const rules: RuleLite[] = (rawRules as unknown as RawRule[])
    .map((r) => ({
      sku: String(r.sku ?? ""),
      name: String(r.name ?? ""),
      category: r.category != null ? String(r.category) : undefined,
    }))
    // UIのプルダウンが安定するように並べ替え
    .sort((a, b) => {
      const ca = a.category ?? "";
      const cb = b.category ?? "";
      if (ca !== cb) return ca.localeCompare(cb, "ja");
      return a.name.localeCompare(b.name, "ja");
    });

  return NextResponse.json({ rules });
}