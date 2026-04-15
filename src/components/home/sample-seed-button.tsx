"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SeedResponse = {
  item: {
    gameId: string;
  };
};

export function SampleSeedButton() {
  const router = useRouter();
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function seedSampleGame() {
    setErrorText(null);

    const response = await fetch("/api/v1/demo/sample-game", {
      method: "POST"
    });
    const body = (await response.json()) as SeedResponse | { error?: string };

    if (!response.ok || !("item" in body)) {
      setErrorText(("error" in body && body.error) || "Unable to seed the sample game.");
      return;
    }

    startTransition(() => {
      router.push(`/games/${body.item.gameId}/gameday`);
    });
  }

  return (
    <div className="stack-sm">
      <button className="button-secondary button-secondary-dark" disabled={isPending} type="button" onClick={() => void seedSampleGame()}>
        {isPending ? "Preparing sample game..." : "Seed sample game"}
      </button>
      {errorText ? <div className="error-note">{errorText}</div> : null}
    </div>
  );
}
