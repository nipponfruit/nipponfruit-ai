"use client";

import { useState } from "react";

type AiBlock = {
  tips?: string[];
  risks?: string[];
  ideas?: string[];
};

type RipenessResponse = {
  sku: string;
  readyDate: string;
  baseSummary: string;
  ai?: AiBlock;         // ← API 側で必ずこの形を返す
  model?: string;       // デバッグ表示用（任意）
};

export default function RipenessPage() {
  const [data, setData] = useState<RipenessResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (form: FormData) => {
    setLoading(true);
    setData(null);
    try {
      const payload = {
        sku: String(form.get("sku") || ""),
        receivedAt: String(form.get("receivedAt") || ""),
        storage: String(form.get("storage") || ""),
        climate: String(form.get("climate") || ""),
        issues: (form.getAll("issues") as string[]) || [],
      };
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  const hasAi =
    !!data?.ai &&
    (data.ai.tips?.length || data.ai.risks?.length || data.ai.ideas?.length);

  const AiSection = () => {
    if (!data?.ai) {
      // ai フィールド自体がない（想定外）→安全にプレースホルダー
      return (
        <div className="rounded-xl border p-4 bg-amber-50">
          <div className="font-semibold mb-1">AIからの追加提案</div>
          <p className="text-sm opacity-70">現在準備中です。</p>
        </div>
      );
    }

    if (!hasAi) {
      // 空配列だった場合のフォールバック表示
      return (
        <div className="rounded-xl border p-4 bg-amber-50">
          <div className="font-semibold mb-1">AIからの追加提案</div>
          <p className="text-sm opacity-70">現在の条件では追加提案は見つかりませんでした。</p>
        </div>
      );
    }

    const ChipList = ({ title, items }: { title: string; items?: string[] }) =>
      items && items.length > 0 ? (
        <div className="mb-3">
          <div className="text-sm font-semibold mb-1">{title}</div>
          <ul className="list-disc pl-5 space-y-1">
            {items.map((t, i) => (
              <li key={i} className="text-sm leading-snug">{t}</li>
            ))}
          </ul>
        </div>
      ) : null;

    return (
      <div className="rounded-xl border p-4">
        <div className="font-semibold mb-2">AIからの追加提案</div>
        <ChipList title="実践Tips" items={data.ai.tips} />
        <ChipList title="リスク&対策" items={data.ai.risks} />
        <ChipList title="活用アイデア" items={data.ai.ideas} />
        {data.model && (
          <div className="mt-2 text-xs text-gray-500">model: {data.model}</div>
        )}
      </div>
    );
  };

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AIフルーツコンシェルジュ</h1>

      {/* 送信フォームはあなたの既存UIに置き換えOK */}
      <form
        className="grid gap-3 p-4 rounded-xl border"
        action={async (formData) => submit(formData)}
      >
        <input name="sku" placeholder="例: taishu-kaki" className="border p-2 rounded" />
        <input name="receivedAt" placeholder="YYYY-MM-DD" className="border p-2 rounded" />
        <select name="storage" className="border p-2 rounded">
          <option value="room">常温</option>
          <option value="vegroom">野菜室</option>
          <option value="fridge">冷蔵庫</option>
        </select>
        <select name="climate" className="border p-2 rounded">
          <option value="cold">寒い</option>
          <option value="normal">普通</option>
          <option value="hot">暑い</option>
        </select>
        {/* issues は checkbox 等でもOK。ここでは簡易に一個 */}
        <input name="issues" placeholder="気になる点(任意)" className="border p-2 rounded" />
        <button
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "診断中…" : "診断する"}
        </button>
      </form>

      {data && (
        <section className="space-y-4">
          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500 mb-1">日安の食べ頃</div>
            <div className="text-3xl font-bold">{data.readyDate}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="font-semibold mb-2">基本アドバイス</div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {data.baseSummary}
            </pre>
          </div>

          <AiSection />
        </section>
      )}
    </main>
  );
}