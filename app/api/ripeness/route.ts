import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import rules from "@/data/fruit_rules.json";

// OpenAIクライアント初期化
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Payload = {
  sku: string;                          // 例: "beni-haruka"
  receivedAt: string;                   // "yyyy-mm-dd"
  storage: "room" | "fridge" | "vegroom" | "cooldark";
  climate: "cold" | "normal" | "hot";
  issues?: string[];                    // ["sour","hard","soft","spots"] など
};

// 日付加算ユーティリティ
function addDays(d: Date, n: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}

// 食べ頃日計算
function calcDays(rule: any, storage: string, climate: string) {
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

    // 日付フォーマットを統一（/を-に変換）
    body.receivedAt = body.receivedAt.replace(/\//g, "-");

    const rule = (rules as any[]).find((r) => r.sku === body.sku);
    if (!rule) {
      return NextResponse.json({ error: "unknown sku" }, { status: 400 });
    }

    const readyDate = addDays(
      new Date(body.receivedAt),
      calcDays(rule, body.storage, body.climate)
    )
      .toISOString()
      .slice(0, 10);

    // フェイルセーフ用の最低限テキスト
    let summary =
      `目安の食べ頃: ${readyDate}\n` +
      `保存: ${rule.temp_advice}\n` +
      `よくあるNG: ${rule.donts.join("、")}\n` +
      `食べ頃のサイン: ${rule.ready_signs.join("、")}`;

    // GPT-5 nanoで整形
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
利用者の悩み: ${(body.issues || []).join("、") || "特になし"}

必ず出力:
1) 目安の食べ頃日（yyyy-mm-dd）
2) 保存方法（温度や包み方など具体）
3) 追熟のコツ（ある場合）
4) よくあるNG
5) 早見チェックリスト（3点）
語尾はです/ます。家庭環境差に触れて過度に断定しないこと。
`;

      const resp = await client.chat.completions.create({
        model: "gpt-5-nano-2025-08-07", // GPT-5 nano に切り替え
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        max_tokens: 500, // 文章量調整
        temperature: 0.6, // 自然な文章に
      });

      summary = resp.choices[0]?.message?.content?.trim() || summary;
    } catch (e) {
      // LLM失敗時はフェイルセーフでsummaryを返す
    }

    return NextResponse.json({
      sku: rule.sku,
      name: rule.name,
      readyDate,
      summary,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
