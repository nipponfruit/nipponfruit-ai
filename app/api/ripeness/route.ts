// app/api/ripeness/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import rawRules from "@/data/fruit_rules.json";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// === 追加: 環境変数の読み取り（ログはマスク） ===
function readOpenAIKey() {
  const key = process.env.OPENAI_API_KEY ?? "";
  const masked = key ? `${key.slice(0, 4)}…(${key.length})` : "(missing)";
  console.log("[ripeness] OPENAI_API_KEY:", masked);
  return key;
}

export async function POST(req: NextRequest) {
  try {
    // debug モード判定
    const debug = req.nextUrl?.searchParams?.get("debug") === "1";
    const openaiKey = readOpenAIKey();

    if (debug) {
      return NextResponse.json({
        ok: true,
        debug: {
          hasKey: Boolean(openaiKey),
          keyPrefix: openaiKey ? openaiKey.slice(0, 4) : null,
          keyLength: openaiKey ? openaiKey.length : 0,
          nodeEnv: process.env.NODE_ENV || null,
          vercelEnv: process.env.VERCEL_ENV || null,
          runtime: process.env.VERCEL ? "vercel" : "local",
          note: "Environment variables require a redeploy after changes.",
        },
      });
    }

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

    // 基本アドバイス
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

    // OpenAI 呼び出し
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
基本アドバイスに加えて「AI独自の追加提案」をJSON形式で作成。
キー: summaryMd, smartTips[], risks[], uses[], ripenessWindow{start,end,note?}
`;

      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini", // 安定稼働用モデル
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        max_completion_tokens: 500,
      });

      const raw = resp.choices?.[0]?.message?.content?.trim() || "";

      let parsed: Advice | null = null;
      if (raw.startsWith("{")) {
        try {
          parsed = JSON.parse(raw) as Advice;
        } catch {}
      }
      if (!parsed) {
        const m = raw.match(/```json\s*([\s\S]*?)```/i);
        if (m?.[1]) {
          try {
            parsed = JSON.parse(m[1]);
          } catch {}
        }
      }

      if (parsed?.summaryMd) {
        advice = {
          summaryMd: parsed.summaryMd,
          smartTips: parsed.smartTips ?? [],
          risks: parsed.risks ?? [],
          uses: parsed.uses ?? [],
          ripenessWindow: parsed.ripenessWindow ?? { start: windowStart, end: windowEnd },
        };
      } else if (raw) {
        advice = { ...advice, summaryMd: raw };
      }
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status ?? null;
      const code = e?.code ?? e?.response?.data?.error?.code ?? null;
      console.error("AI生成に失敗:", { status, code, message: e?.message });
    }

    return NextResponse.json({
      sku: rule.sku,
      name: rule.name,
      readyDate,
      baseSummary,
      advice,
      summary: baseSummary,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}