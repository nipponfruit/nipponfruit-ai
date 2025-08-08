"use client";
import { useEffect, useMemo, useState } from "react";

const FRUITS = [
  { sku: "beni-haruka", label: "紅はるか" },
  { sku: "shine-muscat", label: "シャインマスカット" },
];

export default function RipenessPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [receivedAt, setReceivedAt] = useState(today);
  const [sku, setSku] = useState(FRUITS[0].sku);
  const [storage, setStorage] = useState<"room" | "fridge" | "vegroom" | "cooldark">("room");
  const [climate, setClimate] = useState<"cold" | "normal" | "hot">("normal");
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // URLクエリからsku初期化（QR連携用: /ripeness?sku=beni-haruka）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const qsSku = p.get("sku");
    if (qsSku && FRUITS.some((f) => f.sku === qsSku)) setSku(qsSku);
  }, []);

  const toggleIssue = (v: string) =>
    setIssues((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // 受取日を yyyy-mm-dd に統一
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

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "error");
      setResult(json);
    } catch (e: any) {
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
                  checked={storage === val}
                  onChange={() => setStorage(val as any)}
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
                  checked={climate === val}
                  onChange={() => setClimate(val as any)}
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
