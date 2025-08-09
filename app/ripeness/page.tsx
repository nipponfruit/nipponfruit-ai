"use client";
import React, { useState } from "react";

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
  summary: string;
  advice?: Advice;
};

export default function RipenessPage() {
  const [date, setDate] = useState("");
  const [fruit, setFruit] = useState("");
  const [storage, setStorage] = useState("room");
  const [climate, setClimate] = useState("normal");
  const [issues, setIssues] = useState<string[]>([]);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        sku: fruit,
        receivedAt: date,
        storage,
        climate,
        issues
      };
      const res = await fetch("/api/ripeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("API error");
      const data: ApiResult = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* フォームUI */}
      {/* 省略：ここに既存の入力UIを入れる */}
      <button onClick={handleSubmit} disabled={loading}>
        アドバイスを見る
      </button>
      {result && (
        <div>
          <h2>基本アドバイス</h2>
          <pre>{result.baseSummary}</pre>
          <h2>AIからの追加提案</h2>
          {result.advice?.summaryMd ? (
            <div>{result.advice.summaryMd}</div>
          ) : (
            <div>(本日は追加提案を取得できませんでした)</div>
          )}
        </div>
      )}
    </div>
  );
}