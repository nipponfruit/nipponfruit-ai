"use client";
import { useEffect, useMemo, useState } from "react";

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

const FRUITS = [
  { sku: "beni-haruka", label: "紅はるか" },
  { sku: "shine-muscat", label: "シャインマスカット" },
] as const;

type Sku = (typeof FRUITS)[number]["sku"];

const STORAGE_OPTIONS: ReadonlyArray<{ value: Storage; label: string }> = [
  { value: "room", label: "常温" },
  { value: "cooldark", label: "冷暗所" },
  { value: "vegroom", label: "野菜室" },
  { value: "fridge", label: "冷蔵庫" },
] as const;

const CLIMATE_OPTIONS: ReadonlyArray<{ value: Climate; label: string }> = [
  { value: "cold", label: "寒い" },
  { value: "normal", label: "普通" },
  { value: "hot", label: "暑い" },
] as const;

type ApiResult = { sku: string; name: string; readyDate: string; summary: string };

// 型ガード
function isSku(v: string): v is Sku {
  return FRUITS.some((f) => f.sku === v);
}

export default function RipenessPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [receivedAt, setReceivedAt] = useState(today);
  const [sku, setSku] = useState<Sku>(FRUITS[0].sku);
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
    try {
      const normalizedDate = receivedAt.replace(/\//g, "-");
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, receivedAt: normalizedDate, storage, climate, issues }),
      });
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const msg = (json as { error?: string })?.error ?? "error";
        throw new Error(msg);
      }
      setResult(json as ApiResult);
    } catch (e: unknown) {
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
            onChange={(e) => {
              const v = e.target.value;
              if (isSku(v)) setSku(v);
            }}
            className="border rounded px-3 py-2"
          >
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
