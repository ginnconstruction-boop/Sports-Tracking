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
          <h2 style={{ margin: 0 }}>Branding and sharing</h2>
          <p className="kicker">
            Control the public-facing name and color palette used by reports, public links, and future branded exports.
          </p>
        </div>
        <span className="chip">{status}</span>
      </div>

      {branding ? (
        <>
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
            style={
              {
                "--brand-primary": branding.primaryColor ?? "#13221b",
                "--brand-secondary": branding.secondaryColor ?? "#f2eadc",
                "--brand-accent": branding.accentColor ?? "#d18d1f"
              } as CSSProperties
            }
          >
            <div className="brand-preview-inner">
              <strong>{branding.publicDisplayName || branding.name}</strong>
              <span>{branding.slug}</span>
            </div>
          </div>
          <div className="timeline-actions">
            <button className="button-primary" disabled={isBusy} type="button" onClick={() => void save()}>
              Save branding
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
