// app/api/ripeness/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import rawRules from "@/data/fruit_rules.json";

// （任意）VercelのEdgeで動かしたい場合はコメントアウト外す
// export const runtime = "edge";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

type Payload = {
  sku: string;
  receivedAt: string; // yyyy-mm-dd または yyyy/mm/dd を許容
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
  // オプション項目（在庫や地域など拡張想定）
  max_stock?: number;
  areas?: { name: string; count?: number }[];
};

const rules: FruitRule[] = rawRules as FruitRule[];

/** 日付加算（ローカルタイム基準でOKなユースケース） */
function addDays(d: Date, n: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}

/** 追熟日数の推定（保管場所×気温帯） */
function calcDays(rule: FruitRule, storage: Storage, climate: Climate) {
  const base =
    storage === "room" || storage === "cooldark"
      ? rule.ripen_room_days ?? 0
      : rule.ripen_cool_days ?? 0;
  const delta = climate === "hot" ? -1 : climate === "cold" ? +1 : 0;
  return Math.max(0, base + delta);
}

/** 安全な日付パース（YYYY/MM/DD も許容して YYYY-MM-DD に整形） */
function normalizeDate(s: string) {
  const safe = s.replace(/\//g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return null;
  const dt = new Date(safe);
  return isNaN(dt.getTime()) ? null : safe;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Payload;

    // 入力バリデーション
    const receivedAt = normalizeDate(body.receivedAt);
    if (!receivedAt) {
      return NextResponse.json(
        { error: "receivedAt は YYYY-MM-DD 形式で指定してください。" },
        { status: 400 }
      );
    }
    if (!body.sku) {
      return NextResponse.json({ error: "sku が必要です。" }, { status: 400 });
    }

    const rule = rules.find((r) => r.sku === body.sku);
    if (!rule) {
      return NextResponse.json({ error: `unknown sku: ${body.sku}` }, { status: 400 });
    }

    const days = calcDays(rule, body.storage, body.climate);
    const readyDate = addDays(new Date(receivedAt), days).toISOString().slice(0, 10);

    // フェイルセーフのベース文（API失敗時のみ使用）
    const fallback =
      `目安の食べ頃: ${readyDate}\n` +
      `保存: ${rule.temp_advice}\n` +
      `よくあるNG: ${rule.donts.join("、")}\n` +
      `食べ頃のサイン: ${rule.ready_signs.join("、")}`;

    // ---- ここから AI で必ず文章を作らせる（成功時はAIの文章を採用）----
    let summary = fallback;
    try {
      const sys =
        "あなたは果物の保存と食べ頃案内の専門家です。安全第一で、断定は避け、丁寧に簡潔に。出力は日本語。箇条書き中心。";

      const user = `
品目: ${rule.name}
カテゴリ: ${rule.category}
受取日: ${receivedAt}
保存環境: ${body.storage}（room=常温, cooldark=冷暗所, vegroom=野菜室, fridge=冷蔵庫）
気温帯: ${body.climate}（cold/normal/hot）
目安食べ頃日: ${readyDate}
注意点: ${rule.donts.join("、")}
食べ頃サイン: ${rule.ready_signs.join("、")}
利用者の悩み: ${(body.issues ?? []).join("、") || "特になし"}

条件:
- 家庭環境で差が出るため、過度に断定しない
- 食品安全を最優先（低温障害や痛みリスクの注意喚起）
- 文字数は 220〜420 字程度
- 見出し＋箇条書きで構成

必ず次の構成で出力:
【目安の食べ頃】yyyy-mm-dd
【保存方法】温度帯・包み方・置き場所（具体的）
【追熟のコツ】ある場合のみ1〜3個
【やりがちなNG】2〜4個
【早見チェックリスト】3項目（短文）
`;

      const resp = await client.chat.completions.create({
        model: "gpt-5-nano-2025-08-07",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        max_tokens: 550,
        temperature: 0.6,
      });

      const content = resp.choices?.[0]?.message?.content?.trim();
      if (content) {
        summary = content; // ★ AIの文章を必ず採用する
      }
    } catch {
      // 失敗時のみベース文
      summary = fallback;
    }
    // ---- AI採用ここまで --------------------------------------------

    return NextResponse.json({
      sku: rule.sku,
      name: rule.name,
      readyDate,
      summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
