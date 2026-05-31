"use client";

export function PrintQuickSheetButton() {
  return (
    <button className="mini-button" type="button" onClick={() => window.print()}>
      Print sideline quick sheet
    </button>
  );
}
