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
  smartTips?: string[];
  risks?: string[];
  uses?: string[];
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

    // 基本アドバイス（常に出す）
    const baseSummary =
      `目安の食べ頃: ${readyDate}\n` +
      `保存: ${rule.temp_advice}\n` +
      `よくあるNG: ${rule.donts.join("、")}\n` +
      `食べ頃のサイン: ${rule.ready_signs.join("、")}`;

    // 追加提案（AI）— 初期値
    let advice: Advice | null = null;

    // --- OpenAI 呼び出し（GPT-5 mini / 3段フォールバック） ---
try {
  const sys =
    "あなたは果物保存と食べ頃の専門家です。食品安全を最優先に、過度に断定しない日本語で答えます。";
  const user = `
【基本アドバイス】
${baseSummary}

【利用者の条件】
果物: ${rule.name}（カテゴリ: ${rule.category}）
受取日: ${receivedAt}
保存環境: ${body.storage}（room=常温 / cooldark=冷暗所 / vegroom=野菜室 / fridge=冷蔵庫）
気温帯: ${body.climate}
食べ頃ウィンドウ: ${windowStart}〜${windowEnd}
悩み: ${(body.issues ?? []).join("、") || "特になし"}

【タスク】
上の基本アドバイスを補完する「AI独自の追加提案」を返してください。
可能なら JSON（キー: summaryMd, smartTips[], risks[], uses[], ripenessWindow{start,end,note?}）。
難しければ、見出し＋箇条書きの Markdown でも構いません。
- summaryMd は 200〜400字。家庭環境差に触れる。
- smartTips は具体ワザを最大3件。
- risks は低温障害・乾燥・過熟の兆候と回避策を最大3件。
- uses は余りや熟度に応じた活用案を最大3件。
`;

  const payloadBase = {
    model: "gpt-5-mini",                // ★ GPT-5 mini を使用
    messages: [
      { role: "system" as const, content: sys },
      { role: "user" as const, content: user },
    ],
    // temperature は一部モデルで非対応のため指定しない（デフォルト=1）
  };

  let raw = "";

  // 1) JSONモードで試行（成功率上げ）
  try {
    const r1 = await client.chat.completions.create({
      ...payloadBase,
      // @ts-ignore （SDKにより型がない場合があるが実体は通る）
      response_format: { type: "json_object" },
      // @ts-ignore
      max_completion_tokens: 600,       // 新仕様名
    });
    raw = r1.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    if (process.env.DEBUG_AI === "1") console.warn("JSONモード失敗:", e);
  }

  // 2) プレーンテキストでもう一度（保険）
  if (!raw) {
    const r2 = await client.chat.completions.create({
      ...payloadBase,
      // @ts-ignore
      max_completion_tokens: 600,
    });
    raw = r2.choices?.[0]?.message?.content?.trim() || "";
  }

  // 3) パース：JSON → ```json 抽出 → そのままテキスト
  let parsed: Advice | null = null;

  if (raw.startsWith("{")) {
    try { parsed = JSON.parse(raw) as Advice; } catch {}
  }
  if (!parsed) {
    const m = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
    if (m?.[1]) {
      try { parsed = JSON.parse(m[1]) as Advice; } catch {}
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
    advice = {
      summaryMd: raw,
      smartTips: [],
      risks: [],
      uses: [],
      ripenessWindow: { start: windowStart, end: windowEnd },
    };
  } else {
    // 4) さらに保険：必ず何かが出る“自前テンプレ”
    advice = {
      summaryMd:
        `保存環境や気温により前後しますが、${windowStart}〜${windowEnd} を中心に風味がまとまりやすい時期です。` +
        `香り・重さ・ヘタ周りの柔らかさを確認しつつ、必要に応じて冷暗所→野菜室へ切替えると過熟対策になります。`,
      smartTips: [
        "新聞紙＋ゆるい袋で乾燥と蒸れを両立して防ぐ",
        "日中高温なら夜間だけ冷暗所へ避難",
        "食べ切れない分は小分けで冷凍してデザートやスムージーに",
      ],
      risks: [
        "低温障害：未熟段階での長時間冷蔵 → 目安日までは常温/冷暗所中心に",
        "乾燥：ヘタや切り口の劣化 → 紙で包み直射日光を避ける",
        "過熟：香りが強すぎ＆全体に柔らかい → 早めに冷やして当日消費",
      ],
      uses: [
        "やや固い時は薄切り＋ヨーグルト",
        "食べ頃直前は半量を先に冷やして時間差で楽しむ",
        "熟しすぎはピューレにしてシャーベットやドレッシングへ",
      ],
      ripenessWindow: { start: windowStart, end: windowEnd },
    };
  }

  // デバッグログ（先頭だけ）
  if (process.env.DEBUG_AI === "1") {
    console.log("AI RAW:", raw.slice(0, 600));
  }
} catch (e) {
  console.warn("AI生成に失敗:", e);
  // ここでは baseSummary のみでも返す。UI側はメッセージ表示。
}

    return NextResponse.json({
      sku: rule.sku,
      name: rule.name,
      readyDate,
      baseSummary,
      summary: baseSummary, // 後方互換
      advice: advice ?? undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}