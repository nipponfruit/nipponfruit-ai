import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import rawRules from "@/data/fruit_rules.json";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

type Payload = {
  sku: string;              // yyyy-mm-dd
  receivedAt: string;
  storage: Storage;
  climate: Climate;
  issues?: string[];
};

type FruitRule = {
  sku: string;
  name: string;
  category: string;
  ripen_room_days?: number;
  ripen_cool_days?: number;
  temp_advice: string;
  ready_signs: string[];
  donts: string[];
};

const rules: FruitRule[] = rawRules as FruitRule[];

function addDays(d: Date, n: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}

function calcDays(rule: FruitRule, storage: Storage, climate: Climate) {
  const base =
    storage === "room" || storage === "cooldark"
      ? rule.ripen_room_days ?? 0
      : rule.ripen_cool_days ?? 0;
  const delta = climate === "hot" ? -1 : climate === "cold" ? +1 : 0;
  return Math.max(0, base + delta);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Payload;
    body.receivedAt = body.receivedAt.replace(/\//g, "-");

    const rule = rules.find((r) => r.sku === body.sku);
    if (!rule) return NextResponse.json({ error: "unknown sku" }, { status: 400 });

    const readyDate = addDays(
      new Date(body.receivedAt),
      calcDays(rule, body.storage, body.climate)
    ).toISOString().slice(0, 10);

    let summary =
      `目安の食べ頃: ${readyDate}\n` +
      `保存: ${rule.temp_advice}\n` +
      `よくあるNG: ${rule.donts.join("、")}\n` +
      `食べ頃のサイン: ${rule.ready_signs.join("、")}`;

    // GPT-5 nanoで整形（失敗時はフェイルセーフで上のsummaryを返す）
    try {
      const sys =
        "あなたは果物の保存と食べ頃案内の専門家です。安全第一で、断定は避け、丁寧に短く。箇条書き中心。";
      const user = `
品目: ${rule.name}
受取日: ${body.receivedAt}
保存環境: ${body.storage}
気温帯: ${body.climate}
目安食べ頃日: ${readyDate}
注意点: ${rule.donts.join("、")}
食べ頃サイン: ${rule.ready_signs.join("、")}
利用者の悩み: ${(body.issues ?? []).join("、") || "特になし"}

必ず出力:
1) 目安の食べ頃日（yyyy-mm-dd）
2) 保存方法（温度や包み方など具体）
3) 追熟のコツ（ある場合）
4) よくあるNG
5) 早見チェックリスト（3点）
語尾はです/ます。家庭環境差に触れて過度に断定しないこと。
`;

      const resp = await client.chat.completions.create({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        max_tokens: 500,
        temperature: 0.6,
      });

      const content = resp.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) summary = content.trim();
    } catch {
      /* ignore */
    }

    return NextResponse.json({ sku: rule.sku, name: rule.name, readyDate, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
