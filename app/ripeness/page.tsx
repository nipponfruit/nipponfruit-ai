// app/ripeness/page.tsx
"use client";

import { useMemo, useState } from "react";
import RULES_JSON from "@/data/fruit_rules.json";

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

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

type ApiAdvice = {
  summaryMd?: string;
  smartTips?: string[];
  risks?: string[];
  uses?: string[];
  ripenessWindow?: { start: string; end: string; note?: string };
};

type ApiResult = {
  sku: string;
  name: string;
  readyDate: string;
  summary?: string;     // 後方互換
  baseSummary?: string; // 現行
  advice?: ApiAdvice;
};

const RULES: FruitRule[] = (RULES_JSON as unknown) as FruitRule[];

const STORAGE_LABEL: Record<Storage, string> = {
  room: "常温",
  cooldark: "冷暗所",
  vegroom: "野菜室",
  fridge: "冷蔵庫",
};
const CLIMATE_LABEL: Record<Climate, string> = {
  cold: "寒い",
  normal: "普通",
  hot: "暑い",
};

const ISSUE_PRESETS = [
  { key: "酸味が強い", val: "酸味が強い" },
  { key: "固い", val: "固い" },
  { key: "柔らかすぎ", val: "柔らかすぎ" },
  { key: "見た目の斑点", val: "見た目の斑点" },
];

function toTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// かなり簡易のMarkdown→HTML（見出し/箇条/改行のみ）
function mdToHtml(md?: string) {
  if (!md) return "";
  let html = md
    .replace(/^### (.*)$/gm, "<h4 class=\"text-base font-semibold mb-1\">$1</h4>")
    .replace(/^## (.*)$/gm, "<h3 class=\"text-lg font-semibold mb-2\">$1</h3>")
    .replace(/^- (.*)$/gm, "<li>$1</li>");
  // <li>が含まれる行を<ul>で包む
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul class=\"list-disc pl-5 space-y-1\">$1</ul>");
  // 残りは改行→<br>
  html = html.replace(/\n/g, "<br/>");
  return html;
}

export default function RipenessPage() {
  // ルールをカテゴリごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, FruitRule[]>();
    for (const r of RULES) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    // 各カテゴリ内を名前順
    for (const [, arr] of map) arr.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    // カテゴリ順も見た目が安定するようソート
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }, []);

  const defaultSku = grouped[0]?.[1]?.[0]?.sku ?? "";
  const [receivedAt, setReceivedAt] = useState(toTodayYMD());
  const [sku, setSku] = useState<string>(defaultSku);
  const [storage, setStorage] = useState<Storage>("room");
  const [climate, setClimate] = useState<Climate>("normal");
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ApiResult | null>(null);

  const pickedRule = useMemo(
    () => RULES.find((r) => r.sku === sku) || null,
    [sku]
  );

  const hasAdvice = useMemo(() => {
    const adv = result?.advice;
    return !!adv && (
      (adv.summaryMd && adv.summaryMd.trim().length > 0) ||
      (adv.smartTips && adv.smartTips.length > 0) ||
      (adv.risks && adv.risks.length > 0) ||
      (adv.uses && adv.uses.length > 0)
    );
  }, [result]);

  function toggleIssue(v: string) {
    setIssues((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }

  async function submit() {
    setError(null);
    setResult(null);

    if (!sku || !RULES.some((r) => r.sku === sku)) {
      setError("果物の選択が正しくありません。");
      return;
    }
    const safeDate = receivedAt.replace(/\//g, "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
      setError("受け取った日が正しい形式（YYYY-MM-DD）ではありません。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          receivedAt: safeDate,
          storage,
          climate,
          issues,
        }),
      });
      const data = (await res.json()) as any;

      if (!res.ok) {
        setError(data?.error || "診断に失敗しました。");
        return;
      }
      setResult(data as ApiResult);
    } catch (e) {
      setError("通信に失敗しました。ネットワークをご確認ください。");
    } finally {
      setLoading(false);
    }
  }

  const readyWindow =
    result?.advice?.ripenessWindow
      ? `${result.advice.ripenessWindow.start} 〜 ${result.advice.ripenessWindow.end}`
      : undefined;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight mb-6">食べ頃アドバイス</h1>

      {/* 入力フォーム */}
      <div className="space-y-6">
        {/* ① 受け取った日 */}
        <div>
          <div className="mb-2 text-sm font-semibold">① 受け取った日</div>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="border rounded px-3 py-2 w-full"
          />
        </div>

        {/* ② 果物 */}
        <div>
          <div className="mb-2 text-sm font-semibold">② 果物</div>
          <select
            className="border rounded px-3 py-2 w-full whitespace-normal"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          >
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((r) => (
                  <option key={r.sku} value={r.sku}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* ③ 保存環境 */}
        <div>
          <div className="mb-2 text-sm font-semibold">③ 保存環境</div>
          <div className="flex flex-wrap gap-6">
            {(
              [
                ["room", "常温"],
                ["cooldark", "冷暗所"],
                ["vegroom", "野菜室"],
                ["fridge", "冷蔵庫"],
              ] as [Storage, string][]
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="storage"
                  checked={storage === key}
                  onChange={() => setStorage(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ④ 気温帯 */}
        <div>
          <div className="mb-2 text-sm font-semibold">④ 気温帯</div>
          <div className="flex flex-wrap gap-6">
            {(
              [
                ["cold", "寒い"],
                ["normal", "普通"],
                ["hot", "暑い"],
              ] as [Climate, string][]
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="climate"
                  checked={climate === key}
                  onChange={() => setClimate(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ⑤ 気になる点 */}
        <div>
          <div className="mb-2 text-sm font-semibold">⑤ 気になる点（任意）</div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {ISSUE_PRESETS.map((it) => (
              <label key={it.key} className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={issues.includes(it.val)}
                  onChange={() => toggleIssue(it.val)}
                />
                <span>{it.key}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={submit}
            disabled={loading}
            className="bg-black text-white px-5 py-3 rounded-md disabled:opacity-50"
          >
            {loading ? "診断中..." : "アドバイスを見る"}
          </button>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 結果カード */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* ヒーローカード */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center rounded-full bg-amber-200/70 px-3 py-1 text-xs font-semibold text-amber-900">
                目安の食べ頃
              </span>
              <span className="text-sm text-amber-900/80">{pickedRule?.name || result.name}</span>
            </div>
            <div className="text-5xl md:text-6xl font-extrabold tracking-tight text-amber-900">
              {result.readyDate}
            </div>
            {readyWindow && (
              <div className="mt-3 text-sm text-amber-900/80">
                ベスト期間: {readyWindow}
              </div>
            )}
          </div>

          {/* 基本アドバイス */}
          <section className="rounded-2xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">基本アドバイス</h2>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                ルールに基づく
              </span>
            </div>
            <div className="text-[15px] leading-7 whitespace-pre-wrap">
              {result.baseSummary || result.summary}
            </div>
          </section>

          {/* AI追加提案 */}
          <section className="rounded-2xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">AIからの追加提案</h2>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                AI独自
              </span>
            </div>

            {!hasAdvice && (
              <p className="text-sm text-gray-500 mb-4">
                （本日は追加提案を取得できませんでした）
              </p>
            )}

            {/* 本文（Markdown簡易レンダリング） */}
            {result?.advice?.summaryMd && (
              <div
                className="prose prose-sm max-w-none mb-4"
                dangerouslySetInnerHTML={{ __html: mdToHtml(result.advice.summaryMd) }}
              />
            )}

            <div className="grid md:grid-cols-3 gap-4">
              {/* 実践Tips */}
              <div className="rounded-xl border p-4">
                <div className="text-sm font-semibold mb-2">実践Tips</div>
                {result?.advice?.smartTips && result.advice.smartTips.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {result.advice.smartTips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
              </div>

              {/* リスク＆対策 */}
              <div className="rounded-xl border p-4">
                <div className="text-sm font-semibold mb-2">リスク＆対策</div>
                {result?.advice?.risks && result.advice.risks.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {result.advice.risks.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
              </div>

              {/* 活用アイデア */}
              <div className="rounded-xl border p-4">
                <div className="text-sm font-semibold mb-2">活用アイデア</div>
                {result?.advice?.uses && result.advice.uses.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {result.advice.uses.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                className="px-4 py-2 rounded-md border text-sm"
                onClick={() => {
                  if (!result) return;
                  const text = `【基本】\n${result.baseSummary || result.summary}\n\n【AI】\n${
                    result.advice?.summaryMd || ""
                  }`;
                  navigator.clipboard.writeText(text);
                }}
              >
                コピー
              </button>
              <button
                className="px-4 py-2 rounded-md border text-sm"
                onClick={() => window.print()}
              >
                印刷
              </button>
            </div>
          </section>

          <p className="text-xs text-gray-500">
            ※ 実際の環境で差があります。目安としてご活用ください。
          </p>
        </div>
      )}
    </div>
  );
}