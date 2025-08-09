/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ---- 設定 ---------------------------------------------------
const MODEL = process.env.RIPENESS_MODEL?.trim() || "gpt-5-mini";
const MAX_TOKENS = 400; // 念のための上限
// ------------------------------------------------------------

// AI応答の形ゆらぎを吸収して、UI が読む形に正規化する
function normalizeAi(raw: any) {
  if (!raw || typeof raw !== "object") return { tips: [], risks: [], ideas: [] };

  // ありがちな別名も吸収
  const tipsSrc = raw.tips ?? raw.practicalTips ?? raw.suggestions ?? raw.tip ?? [];
  const risksSrc = raw.risks ?? raw.risk ?? [];
  const ideasSrc = raw.ideas ?? raw.uses ?? raw.idea ?? [];

  const toTextArray = (v: any) =>
    (Array.isArray(v) ? v : [v])
      .filter(Boolean)
      .map((x) => String(x))
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);

  const ai = {
    tips: toTextArray(tipsSrc),
    risks: toTextArray(risksSrc),
    ideas: toTextArray(ideasSrc),
  };

  // 万一ぜんぶ空なら、最低1件だけ入れておく（UI を確実に出す）
  if (ai.tips.length + ai.risks.length + ai.ideas.length === 0) {
    ai.tips = ["ヘタ部分を下にして野菜室で保存。数日に一度、状態を点検しましょう。"];
  }
  return ai;
}

// リクエストボディのバリデーション（最低限）
function parseBody(reqBody: any) {
  const sku = String(reqBody?.sku ?? "").trim();
  const receivedAt = String(reqBody?.receivedAt ?? "").trim();
  const storage = String(reqBody?.storage ?? "").trim(); // "room" | "fridge" | "vegroom" | …
  const climate = String(reqBody?.climate ?? "").trim(); // "cold" | "normal" | "hot"
  const issues = Array.isArray(reqBody?.issues) ? reqBody.issues : [];

  if (!sku || !receivedAt) {
    throw new Error("missing required fields: sku/receivedAt");
  }
  return { sku, receivedAt, storage, climate, issues };
}

// 仮：ベースの熟度・サマリはあなたの既存ロジックを置く
async function getBaseAdvice(params: {
  sku: string;
  receivedAt: string;
  storage: string;
  climate: string;
  issues: string[];
}) {
  const readyDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // +2日
    .toISOString()
    .slice(0, 10);

  const baseSummary =
    `目安の食べ頃: ${readyDate}\n` +
    `保存: 野菜室で保存。点検しつつ調整してください。`;

  return {
    sku: params.sku,
    readyDate,
    baseSummary,
  };
}

// OpenAI 呼び出し（追加提案3カテゴリを要求）
async function callOpenAiForExtras(input: {
  sku: string;
  receivedAt: string;
  storage: string;
  climate: string;
  issues: string[];
}) {
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
    response_format: { type: "json_object" },
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

// ---- Route Handler ----------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseBody(body);

    const base = await getBaseAdvice(input);

    let aiResult = { tips: [], risks: [], ideas: [] as string[] };
    try {
      aiResult = await callOpenAiForExtras(input);
    } catch (e) {
      console.error("openai error:", e);
    }

    return NextResponse.json(
      {
        ...base,
        ai: aiResult,
        model: MODEL,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "bad request" }, { status: 400 });
  }
}