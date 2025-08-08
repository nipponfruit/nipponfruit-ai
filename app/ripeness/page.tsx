"use client";
import { useMemo, useState } from "react";
import rulesRaw from "@/data/fruit_rules.json";

type FruitRule = {
  sku: string;
  name: string;
  category: string;
  ripen_room_days: number;
  ripen_cool_days: number;
  temp_advice: string;
  ready_signs: string[];
  donts: string[];
  max_stock?: number;
  areas?: { name: string; count?: number }[];
};

const RULES = rulesRaw as FruitRule[];

// カテゴリ → 品目[] に整形
function groupByCategory(rules: FruitRule[]) {
  const map = new Map<string, { sku: string; label: string }[]>();
  for (const r of rules) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push({ sku: r.sku, label: r.name });
  }
  // 表示順を安定させる（カテゴリ名順）
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.label.localeCompare(b.label, "ja")),
    }));
}

export default function RipenessPage() {
  const grouped = useMemo(() => groupByCategory(RULES), []);
  const defaultSku = grouped[0]?.items[0]?.sku ?? "";
  const [sku, setSku] = useState(defaultSku);
  const [storage, setStorage] = useState<Storage>("room");
  const [climate, setClimate] = useState<Climate>("normal");
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // URLクエリからsku初期化
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
  
    // ▼ここからバリデーション
    if (!sku || !RULES.some(r => r.sku === sku)) {
      setError("果物の選択が正しくありません。");
      setLoading(false);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt.replace(/\//g, "-"))) {
      setError("受け取った日が正しい形式（YYYY-MM-DD）ではありません。");
      setLoading(false);
      return;
    }
    // ▲ここまでバリデーション
  
    try {
      const normalizedDate = receivedAt.replace(/\//g, "-");
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, receivedAt: normalizedDate, storage, climate, issues }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "error");
      setResult(json);
    } catch (e) {
      setError(e.message);
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
            className="border rounded px-3 py-2 w-full whitespace-normal">
            {FRUITS.map((f) => (
        <option key={f.sku} value={f.sku}>
            {f.label}
        </option>
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
