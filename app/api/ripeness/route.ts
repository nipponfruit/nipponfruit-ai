// app/api/ripeness/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import rawRules from "@/data/fruit_rules.json";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// モデルは環境変数で上書き可。未指定なら gpt-5-nano を使用
const MODEL = process.env.RIPENESS_MODEL ?? "gpt-5-nano";

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

type Payload = {
  sku: string;
  receivedAt: string; // yyyy-mm-dd or yyyy/mm/dd
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

type Advice = {
  summaryMd: string;
  smartTips: string[];
  risks: string[];
  uses: string[];
  ripenessWindow?: { start: string; end: string; note?: string };
};

const rules: FruitRule[] = rawRules as FruitRule[];

// ---------- helpers ----------
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
function normalizeDate(s: string) {
  const safe = s.replace(/\//g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return null;
  const dt = new Date(safe);
  return isNaN(dt.getTime()) ? null : safe;
}
function calcWindowDays(baseDays: number) {
  const start = Math.max(0, baseDays - 1);
  const end = baseDays + 1;
  return { start, end };
}
function ensureAdvice(base: Advice, windowStart: string, windowEnd: string): Advice {
  return {
    summaryMd:
      base.summaryMd ||
      "追加の提案は現在準備中です。保存環境や気温によって差が出るため、適宜点検しながら調整してください。",
    smartTips: Array.isArray(base.smartTips) ? base.smartTips : [],
    risks: Array.isArray(base.risks) ? base.risks : [],
    uses: Array.isArray(base.uses) ? base.uses : [],
    ripenessWindow: base.ripenessWindow ?? { start: windowStart, end: windowEnd },
  };
}
function tryParseAdvice(raw: string): Advice | null {
  if (!raw) return null;

  if (raw.trim().startsWith("{")) {
    try {
      return JSON.parse(raw) as Advice;
    } catch {
      /* noop */
    }
  }
  const fence =
    raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]) as Advice;
    } catch {
      /* noop */
    }
  }
  return { summaryMd: raw, smartTips: [], risks: [], uses: [] };
}

// ---------- route ----------
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Payload;

    const receivedAt = normalizeDate(body.receivedAt);
    if (!receivedAt) {
      return NextResponse.json(
        { error: "受取日が正しい形式（YYYY-MM-DD）ではありません。" },
        { status: 400 }
      );
    }

    const rule = rules.find((r) => r.sku === body.sku);
    if (!rule) {
      return NextResponse.json(
        { error: `unknown sku: ${body.sku}` },
        { status: 400 }
      );
    }

    const days = calcDays(rule, body.storage, body.climate);
    const readyDate = addDays(new Date(receivedAt), days)
      .toISOString()
      .slice(0, 10);

    const { start, end } = calcWindowDays(days);
    const windowStart = addDays(new Date(receivedAt), start)
      .toISOString()
      .slice(0, 10);
    const windowEnd = addDays(new Date(receivedAt), end)
      .toISOString()
      .slice(0, 10);

    const baseSummary =
      `目安の食べ頃: ${readyDate}\n` +
      `保存: ${rule.temp_advice}\n` +
      `よくあるNG: ${rule.donts.join("、")}\n` +
      `食べ頃のサイン: ${rule.ready_signs.join("、")}`;

    let advice: Advice = {
      summaryMd: "",
      smartTips: [],
      risks: [],
      uses: [],
      ripenessWindow: { start: windowStart, end: windowEnd },
    };

    try {
      const sys =
        "あなたは果物保存と食べ頃案内の専門家。食品安全最優先。出力は日本語。";
      const user = `
【基本アドバイス】
${baseSummary}

【利用者の条件】
果物: ${rule.name}（カテゴリ: ${rule.category}）
受取日: ${receivedAt}
保存環境: ${body.storage}
気温帯: ${body.climate}
食べ頃ウィンドウ（目安）: ${windowStart}〜${windowEnd}
ユーザーの悩み: ${(body.issues ?? []).join("、") || "特になし"}

【タスク】
上の基本アドバイスはそのままに、さらに役立つ「AI独自の追加提案」を作成。
必ずJSON形式（summaryMd, smartTips[], risks[], uses[], ripenessWindow{start,end,note?}）で返す。
`;

      // OpenAI 呼び出し
      // @ts-expect-error OpenAI SDK の型が環境により max_completion_tokens を未定義としている場合があるため
      const resp = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        // nano 系は max_completion_tokens を推奨
        // @ts-expect-error 同上
        max_completion_tokens: 400,
        temperature: 0.3,
      });

      const raw = resp.choices?.[0]?.message?.content?.trim() || "";
      const parsed = tryParseAdvice(raw);
      if (parsed) advice = parsed;
    } catch (e) {
      console.warn("AI生成に失敗:", e);
    }

    advice = ensureAdvice(advice, windowStart, windowEnd);

    return NextResponse.json({
      sku: rule.sku,
      name: rule.name,
      readyDate,
      baseSummary,
      advice,
      summary: baseSummary, // 後方互換
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}