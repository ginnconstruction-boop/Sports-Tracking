"use client";

import { useMemo, useState } from "react";
import type { TendencyLine } from "@/lib/analytics/tendency-breakdown";

type TendencyDataset = {
  key: string;
  label: string;
  gameCount: number;
  offense: TendencyLine[];
  defense: TendencyLine[];
};

type Props = {
  offenseLabel: string;
  defenseLabel: string;
  datasets: TendencyDataset[];
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function TendencyBreakdownPanel({ offenseLabel, defenseLabel, datasets }: Props) {
  const [mode, setMode] = useState<"offense" | "defense">("offense");
  const [datasetKey, setDatasetKey] = useState<string>(datasets[0]?.key ?? "game");

  const activeDataset = useMemo(
    () => datasets.find((dataset) => dataset.key === datasetKey) ?? datasets[0] ?? null,
    [datasetKey, datasets]
  );

  const lines = useMemo(() => {
    if (!activeDataset) {
      return [];
    }
    return mode === "offense" ? activeDataset.offense : activeDataset.defense;
  }, [mode, activeDataset]);
  const titleLabel = mode === "offense" ? offenseLabel : defenseLabel;

  return (
    <section className="section-card pad-lg stack-md">
      <div className="entry-header">
        <h2 style={{ margin: 0 }}>Play-call tendency breakdown</h2>
        <span className="chip">{titleLabel}</span>
      </div>
      <div className="pill-row">
        <label className="kicker" htmlFor="tendency-dataset">
          Scope
        </label>
        <select
          id="tendency-dataset"
          value={datasetKey}
          onChange={(event) => setDatasetKey(event.target.value)}
        >
          {datasets.map((dataset) => (
            <option key={dataset.key} value={dataset.key}>
              {dataset.label} ({dataset.gameCount})
            </option>
          ))}
        </select>
        <button
          className={mode === "offense" ? "button-primary button-primary-small" : "button-secondary button-secondary-light"}
          type="button"
          onClick={() => setMode("offense")}
        >
          Offense
        </button>
        <button
          className={mode === "defense" ? "button-primary button-primary-small" : "button-secondary button-secondary-light"}
          type="button"
          onClick={() => setMode("defense")}
        >
          Defense
        </button>
      </div>

      <div className="table-like">
        {!activeDataset ? <div className="kicker">No tendency data available yet.</div> : null}
        {lines.map((line) => (
          <div className="timeline-card" key={`${mode}-${line.key}`}>
            <div className="timeline-top">
              <strong>{line.label}</strong>
              <span className="mono">{line.plays} plays</span>
            </div>
            <div className="pill-row">
              <span className="chip">Run {line.runs}</span>
              <span className="chip">Pass {line.passes}</span>
              <span className="chip">Run rate {formatPercent(line.runRate)}</span>
              <span className="chip">Pass rate {formatPercent(line.passRate)}</span>
            </div>
            <div className="pill-row">
              <span className="chip">Success {formatPercent(line.successRate)}</span>
              <span className="chip">YPP {line.yardsPerPlay}</span>
              <span className="chip">Conversions {line.conversions}</span>
              <span className="chip">Conv rate {formatPercent(line.conversionRate)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
