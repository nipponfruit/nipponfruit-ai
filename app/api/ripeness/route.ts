import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import rawRules from "@/data/fruit_rules.json";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

type Payload = {
  sku: string;
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

type Advice = {
  summaryMd: string;
  smartTips: string[];
  risks: string[];
  uses: string[];
  ripenessWindow?: { start: string; end: string; note?: string };
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
    if (!rule) return NextResponse.json({ error: "unknown sku" }, { status: 400 });

    const days = calcDays(rule, body.storage, body.climate);
    const readyDate = addDays(new Date(receivedAt), days).toISOString().slice(0, 10);

    const { start, end } = calcWindowDays(days);
    const windowStart = addDays(new Date(receivedAt), start).toISOString().slice(0, 10);
    const windowEnd = addDays(new Date(receivedAt), end).toISOString().slice(0, 10);

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
      ripenessWindow: { start: windowStart, end: windowEnd }
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
上の基本アドバイスに加えて役立つ「AI独自の追加提案」を作成。
まず JSON で返す（キー: summaryMd, smartTips[], risks[], uses[], ripenessWindow{start,end,note?}）。
JSONが難しい場合はMarkdownで返す。
`;

      const payloadBase = {
        model: "gpt-5-mini", // 修正ポイント
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      };

      // @ts-expect-error max_completion_tokens は型未対応
      const resp = await client.chat.completions.create({
        ...payloadBase,
        max_completion_tokens: 600
      });

      const raw = resp.choices?.[0]?.message?.content?.trim() || "";

      let parsed: Advice | null = null;
      if (raw.startsWith("{")) {
        try { parsed = JSON.parse(raw) as Advice; } catch {}
      }
      if (!parsed) {
        const m = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
        if (m?.[1]) {
          try { parsed = JSON.parse(m[1]); } catch {}
        }
      }

      if (parsed?.summaryMd) {
        advice = {
          summaryMd: parsed.summaryMd,
          smartTips: parsed.smartTips ?? [],
          risks: parsed.risks ?? [],
          uses: parsed.uses ?? [],
          ripenessWindow: parsed.ripenessWindow ?? { start: windowStart, end: windowEnd }
        };
      } else if (raw) {
        advice = { ...advice, summaryMd: raw };
      }
    } catch (err) {
      console.error("AI生成に失敗:", err);
    }

    return NextResponse.json({
      sku: rule.sku,
      name: rule.name,
      readyDate,
      baseSummary,
      advice,
      summary: baseSummary
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}