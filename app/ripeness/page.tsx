// app/ripeness/page.tsx
"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";

/** ---------- Types ---------- **/
type RuleLite = { sku: string; name: string; category?: string };

type Advice = {
  summaryMd: string;
  smartTips: string[];
  risks: string[];
  uses: string[];
  ripenessWindow?: { start: string; end: string; note?: string };
};

type ApiResult = {
  sku: string;
  name: string;
  readyDate: string;
  baseSummary: string;
  advice?: Advice;
};

/** ---------- Labels ---------- **/
const STORAGE_LABEL: Record<"room" | "cooldark" | "vegroom" | "fridge", string> = {
  room: "常温",
  cooldark: "冷暗所",
  vegroom: "野菜室",
  fridge: "冷蔵庫",
};

const CLIMATE_LABEL: Record<"cold" | "normal" | "hot", string> = {
  cold: "寒い",
  normal: "普通",
  hot: "暑い",
};

const ISSUE_LIST = [
  { key: "酸味が強い", label: "酸味が強い" },
  { key: "固い", label: "固い" },
  { key: "柔らかすぎ", label: "柔らかすぎ" },
  { key: "見た目の斑点", label: "見た目の斑点" },
] as const;

/** ---------- Utils ---------- **/
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** ---------- UI parts ---------- **/
function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/** ---------- Page ---------- **/
export default function RipenessPage() {
  // inputs
  const [date, setDate] = useState<string>(todayStr());
  const [sku, setSku] = useState<string>("");
  const [storage, setStorage] =
    useState<"room" | "cooldark" | "vegroom" | "fridge">("room");
  const [climate, setClimate] = useState<"cold" | "normal" | "hot">("normal");
  const [issues, setIssues] = useState<string[]>([]);

  // master
  const [rules, setRules] = useState<RuleLite[]>([]);
  const fruitsByCategory = useMemo(() => {
    const m = new Map<string, RuleLite[]>();
    for (const r of rules) {
      const cat = r.category ?? "";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(r);
    }
    return m;
  }, [rules]);

  // result
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  // fetch rules
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fruit-rules", { method: "GET" });
        const data = (await res.json()) as { rules: RuleLite[] };
        if (!cancelled) {
          setRules(data.rules);
          if (!sku && data.rules.length > 0) setSku(data.rules[0].sku);
        }
      } catch {
        if (!cancelled) setErrMsg("果物リストの取得に失敗しました。");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // submit
  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setErrMsg("");
    try {
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          receivedAt: date,
          storage,
          climate,
          issues,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `API error (${res.status})`);
      }
      const data = (await res.json()) as ApiResult;
      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      setErrMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    // 常時白背景 & 黒文字固定（スマホ夜間モードでも）
    <div className="min-h-screen bg-white text-black" style={{ colorScheme: "light" as never }}>
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        {/* タイトル画像（public/ai-fruit-concierge.png を表示） */}
        <div className="mb-2">
          <Image
            src="/ai-fruit-concierge.png"
            alt="AIフルーツコンシェルジュ"
            width={860}
            height={160}
            priority
            className="h-auto w-full max-w-[520px]"
          />
        </div>
        <div className="mb-6 text-xs text-neutral-500">
          Powered by <span className="font-semibold">NipponFruit</span>
        </div>

        {/* form */}
        <div className="space-y-6 bg-white rounded-xl shadow-sm border p-4 md:p-6">
          {/* date */}
          <div>
            <label className="block text-sm font-medium mb-2">① 受け取った日</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full md:w-64 border rounded-lg px-3 py-2"
            />
          </div>

          {/* fruit */}
          <div>
            <label className="block text-sm font-medium mb-2">② 果物</label>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {[...fruitsByCategory.entries()].map(([cat, list]) => (
                <optgroup key={cat || "その他"} label={cat || "その他"}>
                  {list.map((r) => (
                    <option key={r.sku} value={r.sku}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* storage */}
          <div>
            <span className="block text-sm font-medium mb-2">③ 保存環境</span>
            <div className="flex flex-wrap gap-4">
              {(["room", "cooldark", "vegroom", "fridge"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="storage"
                    value={k}
                    checked={storage === k}
                    onChange={() => setStorage(k)}
                  />
                  <span>{STORAGE_LABEL[k]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* climate */}
          <div>
            <span className="block text-sm font-medium mb-2">④ 気温帯</span>
            <div className="flex flex-wrap gap-4">
              {(["cold", "normal", "hot"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="climate"
                    value={k}
                    checked={climate === k}
                    onChange={() => setClimate(k)}
                  />
                  <span>{CLIMATE_LABEL[k]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* issues */}
          <div>
            <span className="block text-sm font-medium mb-2">⑤ 気になる点（任意）</span>
            <div className="flex flex-wrap gap-4">
              {ISSUE_LIST.map((it) => {
                const checked = issues.includes(it.key);
                return (
                  <label key={it.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setIssues((prev) =>
                          checked ? prev.filter((x) => x !== it.key) : [...prev, it.key]
                        )
                      }
                    />
                    <span>{it.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* submit */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={loading || !sku || !date}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-black text-white px-5 py-2.5 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Spinner />
                  <span>おいしいタイミングを計算しています…</span>
                </>
              ) : (
                "アドバイスを見る"
              )}
            </button>

            {/* subtle loading message under the button */}
            <div className="mt-2 h-5" aria-live="polite">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-600 italic">
                  <Spinner size={14} />
                  <span>AIが保存方法も考えています…少々お待ちください。</span>
                </div>
              )}
            </div>

            {errMsg && <p className="mt-2 text-sm text-red-600">{errMsg}</p>}
          </div>
        </div>

        {/* result */}
        {result && (
          <div className="mt-8 space-y-6">
            {/* big date */}
            <div className="rounded-2xl border bg-[#fff7e9] p-5 md:p-6">
              <div className="flex items-center justify-between">
                <div className="text-sm md:text-base">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#f2d9a6] px-3 py-1 mr-2">
                    目安の食べ頃
                  </span>
                  <span className="opacity-70">{result.name}</span>
                </div>
              </div>
              <div className="mt-3 md:mt-4 text-4xl md:text-6xl font-extrabold text-[#7a3d00] tracking-wider">
                {result.readyDate}
              </div>
            </div>

            {/* base advice */}
            <div className="rounded-2xl border bg-white p-5 md:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-semibold">基本アドバイス</h2>
                <span className="text-xs md:text-sm opacity-60">ルールに基づく</span>
              </div>
              <div className="mt-3 whitespace-pre-wrap leading-7">{result.baseSummary}</div>
            </div>

            {/* AI extra */}
            <div className="rounded-2xl border bg-white p-5 md:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-semibold">AIからの追加提案</h2>
                <span className="text-xs md:text-sm opacity-60">AI独自</span>
              </div>

              {result.advice?.summaryMd ? (
                <>
                  <div className="prose prose-sm md:prose-base mt-3 whitespace-pre-wrap">
                    {result.advice.summaryMd}
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 mt-4">
                    <div className="rounded-xl border p-4">
                      <div className="font-semibold mb-2">実践Tips</div>
                      {result.advice.smartTips?.length ? (
                        <ul className="list-disc list-inside space-y-1">
                          {result.advice.smartTips.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="opacity-60">—</div>
                      )}
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="font-semibold mb-2">リスク＆対策</div>
                      {result.advice.risks?.length ? (
                        <ul className="list-disc list-inside space-y-1">
                          {result.advice.risks.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="opacity-60">—</div>
                      )}
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="font-semibold mb-2">活用アイデア</div>
                      {result.advice.uses?.length ? (
                        <ul className="list-disc list-inside space-y-1">
                          {result.advice.uses.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="opacity-60">—</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="opacity-60 mt-3">（本日は追加提案を取得できませんでした）</div>
              )}
            </div>

            <p className="text-xs opacity-60">
              実際の環境で差があります。目安としてご活用ください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}