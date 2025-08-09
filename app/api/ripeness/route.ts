/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/** 追加提案3カテゴリの型 */
type AiBlocks = { tips: string[]; risks: string[]; ideas: string[] };

/** リクエストボディ（UI → API）の型 */
type RipenessInput = {
  sku: string;          // 例: "taishu-kaki"
  receivedAt: string;   // "YYYY-MM-DD"
  storage: string;      // "room" | "fridge" | "vegroom" など
  climate: string;      // "cold" | "normal" | "hot"
  issues: string[];     // 気になる点の自由入力配列
};

// ------------------------------------------------------------
// 設定
// ------------------------------------------------------------
const MODEL = (process.env.RIPENESS_MODEL ?? "gpt-5-mini").trim();
const MAX_TOKENS = 400;

// ------------------------------------------------------------
// ユーティリティ
// ------------------------------------------------------------

/** AI応答の形ゆらぎを吸収して UI が読む形に正規化 */
function normalizeAi(raw: any): AiBlocks {
  if (!raw || typeof raw !== "object") {
    return { tips: [], risks: [], ideas: [] };
  }

  // ありがちな別名も吸収
  const tipsSrc  = raw.tips ?? raw.practicalTips ?? raw.suggestions ?? raw.tip ?? [];
  const risksSrc = raw.risks ?? raw.risk ?? [];
  const ideasSrc = raw.ideas ?? raw.uses ?? raw.idea ?? [];

  const toTextArray = (v: any): string[] =>
    (Array.isArray(v) ? v : [v])
      .filter(Boolean)
      .map((x) => String(x))
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);

  const ai: AiBlocks = {
    tips:  toTextArray(tipsSrc),
    risks: toTextArray(risksSrc),
    ideas: toTextArray(ideasSrc),
  };

  // 万一ぜんぶ空なら、最低1件だけ入れておく（UI を確実に出す）
  if (ai.tips.length + ai.risks.length + ai.ideas.length === 0) {
    ai.tips = ["ヘタ部分を下にして野菜室で保存。数日に一度、状態を点検しましょう。"];
  }
  return ai;
}

/** リクエストボディのバリデーション（最低限） */
function parseBody(reqBody: any): RipenessInput {
  const sku        = String(reqBody?.sku ?? "").trim();
  const receivedAt = String(reqBody?.receivedAt ?? "").trim();
  const storage    = String(reqBody?.storage ?? "").trim();
  const climate    = String(reqBody?.climate ?? "").trim();
  const issues     = Array.isArray(reqBody?.issues)
    ? reqBody.issues.map((s: unknown) => String(s)).filter(Boolean)
    : [];

  if (!sku || !receivedAt) {
    throw new Error("missing required fields: sku/receivedAt");
  }
  return { sku, receivedAt, storage, climate, issues };
}

/** ルールベースのベース情報（必要に応じて data/fruit_rules.json を用いた実装に差し替え） */
async function getBaseAdvice(input: RipenessInput) {
  // ここは簡易ダミー：+2日を食べ頃にする
  const readyDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // 未使用警告を避けるため、受け取った条件もメッセージに織り込む
  const baseSummary =
    [
      `目安の食べ頃: ${readyDate}`,
      `保存: 現在の保存環境は「${input.storage || "不明"}」、気温帯は「${input.climate || "不明"}」。`,
      input.issues.length ? `気になる点: ${input.issues.join("、")}` : "気になる点: 特になし",
      "まずは野菜室で保存し、数日に一度点検して調整してください。"
    ].join("\n");

  return {
    sku: input.sku,
    readyDate,
    baseSummary,
  };
}

/** OpenAI に追加提案（tips/risks/ideas）を生成させる */
async function callOpenAiForExtras(input: RipenessInput): Promise<AiBlocks> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const prompt = `あなたは青果の保管・熟度アドバイザーです。
対象: ${input.sku}
受取日: ${input.receivedAt}
保存環境: ${input.storage}
気温帯: ${input.climate}
気になる点: ${input.issues.join("、") || "なし"}

次の3つのカテゴリで、簡潔な短文リストを日本語で出してください。
JSONのみで返答し、余計な説明やコードブロックは不要です。

{
  "tips": ["実践的な保存/扱いのTipを2〜4個"],
  "risks": ["起こり得るリスクや注意点を1〜3個"],
  "ideas": ["活用アイデア（食べ方/アレンジ）を1〜3個"]
}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: MAX_TOKENS,
    temperature: 0.4,
    response_format: { type: "json_object" }, // JSON で返させる
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return normalizeAi(parsed);
}

// ------------------------------------------------------------
// Route Handler
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseBody(body);

    // ルールベースのベース情報
    const base = await getBaseAdvice(input);

    // 追加提案（OpenAI）
    let ai: AiBlocks = { tips: [], risks: [], ideas: [] };
    try {
      ai = await callOpenAiForExtras(input);
    } catch (e) {
      // 失敗してもAPIは成功させ、aiを空のまま返す
      console.error("openai error:", e);
    }

    return NextResponse.json(
      {
        ...base,
        ai,           // UI はここを見る
        model: MODEL, // デバッグ確認用（不要なら削除OK）
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "bad request" },
      { status: 400 }
    );
  }
}