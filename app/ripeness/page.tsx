"use client";
import { useEffect, useMemo, useState } from "react";
import rulesRaw from "@/data/fruit_rules.json";

/** ==== types ==== */
type FruitRule = {
  sku: string;
  name: string;
  category: string;
  ripen_room_days?: number;
  ripen_cool_days?: number;
  temp_advice: string;
  ready_signs: string[];
  donts: string[];
  max_stock?: number;
  areas?: { name: string; count?: number }[];
};

// DOM の Storage と名前衝突を避けるため別名にする
type FruitStorage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

type ApiResult = {
  sku: string;
  name: string;
  readyDate: string;
  summary: string;
};

const RULES = rulesRaw as FruitRule[];

/** カテゴリ → 品目[] に整形（表示順を安定） */
function groupByCategory(rules: FruitRule[]) {
  const map = new Map<string, { sku: string; label: string }[]>();
  for (const r of rules) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push({ sku: r.sku, label: r.name });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.label.localeCompare(b.label, "ja")),
    }));
}

const STORAGE_OPTIONS: { value: FruitStorage; label: string }[] = [
  { value: "room", label: "常温" },
  { value: "cooldark", label: "冷暗所" },
  { value: "vegroom", label: "野菜室" },
  { value: "fridge", label: "冷蔵庫" },
];

const CLIMATE_OPTIONS: { value: Climate; label: string }[] = [
  { value: "cold", label: "寒い" },
  { value: "normal", label: "普通" },
  { value: "hot", label: "暑い" },
];

const isSku = (v: string) => RULES.some((r) => r.sku === v);

export default function RipenessPage() {
  const grouped = useMemo(() => groupByCategory(RULES), []);
  const defaultSku = grouped[0]?.items[0]?.sku ?? "";

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [receivedAt, setReceivedAt] = useState<string>(today);
  const [sku, setSku] = useState<string>(defaultSku);
  const [storage, setStorage] = useState<FruitStorage>("room");
  const [climate, setClimate] = useState<Climate>("normal");
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** URLクエリから sku 初期化（例: /ripeness?sku=melon） */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const qsSku = p.get("sku");
    if (qsSku && isSku(qsSku)) setSku(qsSku);
  }, []);

  const toggleIssue = (v: string) =>
    setIssues((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    // ▼バリデーション
    if (!sku || !isSku(sku)) {
      setError("果物の選択が正しくありません。");
      setLoading(false);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt.replace(/\//g, "-"))) {
      setError("受け取った日が正しい形式（YYYY-MM-DD）ではありません。");
      setLoading(false);
      return;
    }
    // ▲ここまで

    try {
      const normalizedDate = receivedAt.replace(/\//g, "-");
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          receivedAt: normalizedDate,
          storage,
          climate,
          issues,
        }),
      });
      const json = (await res.json()) as ApiResult | { error: string };
      if (!res.ok) throw new Error((json as any).error || "error");
      setResult(json as ApiResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">食べ頃アドバイス</h1>

      <ol className="space-y-4">
        <li>
          <label className="block text-sm mb-1">① 受け取った日</label>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </li>

        <li>
          <label className="block text-sm mb-1">② 果物</label>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="border rounded px-3 py-2 w-full whitespace-normal"
          >
            {grouped.map(({ category, items }) => (
              <optgroup key={category} label={category}>
                {items.map((it) => (
                  <option key={it.sku} value={it.sku}>
                    {it.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </li>

        <li>
          <label className="block text-sm mb-1">③ 保存環境</label>
          <div className="space-x-4">
            {STORAGE_OPTIONS.map(({ value, label }) => (
              <label key={value}>
                <input
                  type="radio"
                  name="storage"
                  value={value}
                  checked={storage === value}
                  onChange={() => setStorage(value)}
                  className="mr-1"
                />
                {label}
              </label>
            ))}
          </div>
        </li>

        <li>
          <label className="block text-sm mb-1">④ 気温帯</label>
          <div className="space-x-4">
            {CLIMATE_OPTIONS.map(({ value, label }) => (
              <label key={value}>
                <input
                  type="radio"
                  name="climate"
                  value={value}
                  checked={climate === value}
                  onChange={() => setClimate(value)}
                  className="mr-1"
                />
                {label}
              </label>
            ))}
          </div>
        </li>

        <li>
          <label className="block text-sm mb-1">⑤ 気になる点（任意）</label>
          <div className="space-x-4">
            {[
              ["sour", "酸味が強い"],
              ["hard", "固い"],
              ["soft", "柔らかすぎ"],
              ["spots", "見た目の斑点"],
            ].map(([v, l]) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={issues.includes(v)}
                  onChange={() => toggleIssue(v)}
                  className="mr-1"
                />
                {l}
              </label>
            ))}
          </div>
        </li>
      </ol>

      <button
        onClick={submit}
        disabled={loading}
        className="mt-5 rounded bg-black text-white px-4 py-2 disabled:opacity-60"
      >
        {loading ? "計算中..." : "アドバイスを見る"}
      </button>

      {error && <p className="mt-4 text-red-600">エラー: {error}</p>}

      {result && (
        <section className="mt-6 border rounded p-4">
          <p className="mb-2">
            <b>目安の食べ頃：</b>
            {result.readyDate}
          </p>
          <pre className="whitespace-pre-wrap text-sm">{result.summary}</pre>
        </section>
      )}

      <p className="mt-6 text-xs text-gray-500">
        ※ 実際の環境で差があります。目安としてご活用ください。
      </p>
    </main>
  );
}
