"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type Branding = {
  organizationId: string;
  name: string;
  slug: string;
  publicDisplayName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  wordmarkPath?: string | null;
};

type Props = {
  organizationId: string;
};

const defaultBrandPalette = {
  primaryColor: "#13221b",
  secondaryColor: "#f2eadc",
  accentColor: "#d18d1f"
} as const;

function brandingPreviewStyle(branding: Branding) {
  return {
    "--brand-primary": branding.primaryColor ?? defaultBrandPalette.primaryColor,
    "--brand-secondary": branding.secondaryColor ?? defaultBrandPalette.secondaryColor,
    "--brand-accent": branding.accentColor ?? defaultBrandPalette.accentColor
  } as CSSProperties;
}

function brandingReadiness(branding: Branding) {
  return [
    {
      label: "Display name",
      ready: Boolean(branding.publicDisplayName?.trim() || branding.name.trim()),
      detail: branding.publicDisplayName?.trim() || branding.name
    },
    {
      label: "Color palette",
      ready: Boolean(branding.primaryColor && branding.secondaryColor && branding.accentColor),
      detail:
        branding.primaryColor && branding.secondaryColor && branding.accentColor
          ? "Primary, secondary, and accent colors are set."
          : "Use all three colors for cleaner report exports."
    },
    {
      label: "Wordmark",
      ready: Boolean(branding.wordmarkPath?.trim()),
      detail: branding.wordmarkPath?.trim() || "Optional for pilot, helpful for PDF exports."
    }
  ];
}

function pilotReadyBranding(branding: Branding) {
  const displayNameReady = Boolean(branding.publicDisplayName?.trim() || branding.name.trim());
  const paletteReady = Boolean(branding.primaryColor && branding.secondaryColor && branding.accentColor);

  return {
    ready: displayNameReady && paletteReady,
    label: displayNameReady && paletteReady ? "Pilot ready" : "Needs setup"
  };
}

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.error ?? "Request failed.");
  }
  return body as T;
}

export function BrandingPanel({ organizationId }: Props) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [status, setStatus] = useState("Loading branding...");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    void readJson<{ item: Branding }>(`/api/v1/organizations/${organizationId}`)
      .then((response) => {
        setBranding(response.item);
        setStatus("Branding ready.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load branding."));
  }, [organizationId]);

  function applyRecommendedDefaults() {
    setBranding((current) =>
      current
        ? {
            ...current,
            publicDisplayName: current.publicDisplayName?.trim() || current.name,
            primaryColor: current.primaryColor ?? defaultBrandPalette.primaryColor,
            secondaryColor: current.secondaryColor ?? defaultBrandPalette.secondaryColor,
            accentColor: current.accentColor ?? defaultBrandPalette.accentColor
          }
        : current
    );
    setStatus("Recommended pilot branding applied locally.");
  }

  async function save() {
    if (!branding) {
      return;
    }

    setIsBusy(true);
    setStatus("Saving branding...");
    try {
      const response = await readJson<{ item: Branding }>(`/api/v1/organizations/${organizationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          publicDisplayName: branding.publicDisplayName || undefined,
          primaryColor: branding.primaryColor || undefined,
          secondaryColor: branding.secondaryColor || undefined,
          accentColor: branding.accentColor || undefined,
          wordmarkPath: branding.wordmarkPath || undefined
        })
      });
      setBranding(response.item);
      setStatus("Branding saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save branding.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="section-card pad-lg stack-md">
      <div className="entry-header">
        <div>
          <h2 style={{ margin: 0 }}>Branding for pilot reports</h2>
          <p className="kicker">
            Set the team name, colors, and optional wordmark used in Game Day headers and coach-ready PDF/XLSX exports.
          </p>
        </div>
        <span className="chip">{status}</span>
      </div>

      {branding ? (
        <>
          <div className="pill-row">
            <span className="chip">{pilotReadyBranding(branding).label}</span>
            <span className="chip">Wordmark optional for pilot</span>
            <span className="chip">Coach exports: PDF / XLSX</span>
          </div>

          <div className="pill-row">
            {brandingReadiness(branding).map((item) => (
              <span className="chip" key={item.label}>
                {item.label}: {item.ready ? "Ready" : "Needs setup"}
              </span>
            ))}
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Public display name</span>
              <input
                value={branding.publicDisplayName ?? ""}
                onChange={(event) =>
                  setBranding((current) => (current ? { ...current, publicDisplayName: event.target.value } : current))
                }
              />
            </label>
            <label className="field">
              <span>Primary color</span>
              <input
                type="color"
                value={branding.primaryColor ?? "#13221b"}
                onChange={(event) =>
                  setBranding((current) => (current ? { ...current, primaryColor: event.target.value } : current))
                }
              />
            </label>
            <label className="field">
              <span>Secondary color</span>
              <input
                type="color"
                value={branding.secondaryColor ?? "#f2eadc"}
                onChange={(event) =>
                  setBranding((current) => (current ? { ...current, secondaryColor: event.target.value } : current))
                }
              />
            </label>
            <label className="field">
              <span>Accent color</span>
              <input
                type="color"
                value={branding.accentColor ?? "#d18d1f"}
                onChange={(event) =>
                  setBranding((current) => (current ? { ...current, accentColor: event.target.value } : current))
                }
              />
            </label>
            <label className="field field-span-2">
              <span>Wordmark / logo path</span>
              <input
                value={branding.wordmarkPath ?? ""}
                onChange={(event) =>
                  setBranding((current) => (current ? { ...current, wordmarkPath: event.target.value } : current))
                }
              />
            </label>
          </div>

          <div
            className="brand-preview"
            style={brandingPreviewStyle(branding)}
          >
            <div className="brand-preview-inner">
              <strong>{branding.publicDisplayName || branding.name}</strong>
              <span>{branding.slug}</span>
            </div>
          </div>

          <div className="report-grid">
            <div className="timeline-card stack-sm" style={brandingPreviewStyle(branding)}>
              <strong>Coach packet preview</strong>
              <div className="kicker">
                {branding.publicDisplayName || branding.name} game report header with your selected palette.
              </div>
              <div className="pill-row">
                <span className="chip">PDF export</span>
                <span className="chip">XLSX export</span>
              </div>
            </div>
            <div className="timeline-card stack-sm">
              <strong>Pilot recommendation</strong>
              <div className="kicker">For launch, keep the display name clean, use all three colors, and add a wordmark if you already have one.</div>
              <div className="kicker">If you do not have a wordmark yet, the rest of the branding setup is still enough to call branding pilot ready.</div>
            </div>
          </div>

          <div className="timeline-actions">
            <button className="button-secondary-light" disabled={isBusy} type="button" onClick={applyRecommendedDefaults}>
              Use recommended defaults
            </button>
            <button className="button-primary" disabled={isBusy} type="button" onClick={() => void save()}>
              Save branding
            </button>
          </div>

          <div className="table-like">
            {brandingReadiness(branding).map((item) => (
              <div className="timeline-card" key={`readiness-${item.label}`}>
                <div className="timeline-top">
                  <strong>{item.label}</strong>
                  <span className="mono">{item.ready ? "ready" : "needs setup"}</span>
                </div>
                <div className="kicker">{item.detail}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
