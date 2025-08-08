"use client";
import { useEffect, useMemo, useState } from "react";

type Storage = "room" | "fridge" | "vegroom" | "cooldark";
type Climate = "cold" | "normal" | "hot";

const FRUITS = [
  { sku: "beni-haruka", label: "紅はるか" },
  { sku: "shine-muscat", label: "シャインマスカット" },
] as const;

type ApiResult = {
  sku: string;
  name: string;
  readyDate: string;
  summary: string;
};

export default function RipenessPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [receivedAt, setReceivedAt] = useState(today);
  const [sku, setSku] = useState<(typeof FRUITS)[number]["sku"]>(FRUITS[0].sku);
  const [storage, setStorage] = useState<Storage>("room");
  const [climate, setClimate] = useState<Climate>("normal");
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const qsSku = p.get("sku");
    if (qsSku && FRUITS.some((f) => f.sku === qsSku)) setSku(qsSku as any);
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
        body: JSON.stringify({
          sku,
          receivedAt: normalizedDate,
          storage,
          climate,
          issues,
        }),
      });

      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          (json as { error?: string })?.error ?? "error";
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
            onChange={(e) => setSku(e.target.value as any)}
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
            {[
              ["room", "常温"],
              ["cooldark", "冷暗所"],
              ["vegroom", "野菜室"],
              ["fridge", "冷蔵庫"],
            ].map(([val, label]) => (
              <label key={val}>
                <input
                  type="radio"
                  name="storage"
                  value={val}
                  checked={storage === (val as Storage)}
                  onChange={() => setStorage(val as Storage)}
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
            {[
              ["cold", "寒い"],
              ["normal", "普通"],
              ["hot", "暑い"],
            ].map(([val, label]) => (
              <label key={val}>
                <input
                  type="radio"
                  name="climate"
                  value={val}
                  checked={climate === (val as Climate)}
                  onChange={() => setClimate(val as Climate)}
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
            ].map(([val, label]) => (
              <label key={val}>
                <input
                  type="checkbox"
                  checked={issues.includes(val)}
                  onChange={() => toggleIssue(val)}
                  className="mr-1"
                />
                {label}
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
