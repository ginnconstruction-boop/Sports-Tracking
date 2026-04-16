"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrganizationDiagnostics } from "@/lib/domain/organization-admin";

type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type Props = {
  memberships: Membership[];
};

async function readJson<T>(input: RequestInfo) {
  const response = await fetch(input);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.error ?? "Request failed.");
  }
  return body as T;
}

export function OrganizationAdminConsole({ memberships }: Props) {
  const [organizationId, setOrganizationId] = useState(memberships[0]?.organizationId ?? "");
  const [diagnostics, setDiagnostics] = useState<OrganizationDiagnostics | null>(null);
  const [status, setStatus] = useState("Select an organization to review readiness and diagnostics.");

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    setStatus("Loading organization diagnostics...");
    void readJson<{ item: OrganizationDiagnostics }>(`/api/v1/organizations/${organizationId}/diagnostics`)
      .then((response) => {
        setDiagnostics(response.item);
        setStatus("Diagnostics ready.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load diagnostics."));
  }, [organizationId]);

  return (
    <section className="section-grid">
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <h2 style={{ margin: 0 }}>Organization diagnostics</h2>
            <p className="kicker">
              Beta-readiness, adoption counts, and support posture for each organization using the same Supabase-backed product workspace.
            </p>
          </div>
          <span className="chip">{status}</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Organization</span>
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              {memberships.map((membership) => (
                <option key={membership.organizationId} value={membership.organizationId}>
                  {membership.organizationName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {diagnostics ? (
        <>
          <section className="three-column">
            <div className="section-card pad-lg stack-sm">
              <h3 style={{ margin: 0 }}>Readiness</h3>
              <div className="pill-row">
                <span className="chip">{diagnostics.brandingComplete ? "Branding ready" : "Branding incomplete"}</span>
                <span className="chip">{diagnostics.activeSeasonCount} active seasons</span>
                <span className="chip">{diagnostics.liveGameCount} live games</span>
                <span className="chip">{diagnostics.publicShareCount} shared games</span>
              </div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h3 style={{ margin: 0 }}>Setup coverage</h3>
              <div className="pill-row">
                <span className="chip">{diagnostics.teamCount} teams</span>
                <span className="chip">{diagnostics.seasonCount} seasons</span>
                <span className="chip">{diagnostics.opponentCount} opponents</span>
                <span className="chip">{diagnostics.venueCount} venues</span>
              </div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h3 style={{ margin: 0 }}>Output volume</h3>
              <div className="pill-row">
                <span className="chip">{diagnostics.gameCount} games</span>
                <span className="chip">{diagnostics.exportCount} exports</span>
                <span className="chip">
                  {diagnostics.lastGameKickoffAt
                    ? new Date(diagnostics.lastGameKickoffAt).toLocaleString()
                    : "No kickoff yet"}
                </span>
              </div>
            </div>
          </section>

          <section className="two-column">
            <section className="section-card pad-lg stack-md">
              <h2 style={{ margin: 0 }}>Operational checklist</h2>
              <div className="table-like">
                <div className="timeline-card">
                  <strong>Branding / sharing</strong>
                  <div className="kicker">
                    {diagnostics.brandingComplete
                      ? "Organization branding is complete for coach/public surfaces."
                      : "Finish public display name and color palette before broad sharing."}
                  </div>
                </div>
                <div className="timeline-card">
                  <strong>Schedule coverage</strong>
                  <div className="kicker">
                    {diagnostics.gameCount > 0
                      ? "At least one game is already scheduled or logged."
                      : "No games scheduled yet. Run onboarding or setup to create the first live workflow."}
                  </div>
                </div>
                <div className="timeline-card">
                  <strong>Export posture</strong>
                  <div className="kicker">
                    {diagnostics.exportCount > 0
                      ? "Exports have already been generated from canonical report documents."
                      : "No report exports generated yet. Run a game report to validate staff workflows."}
                  </div>
                </div>
              </div>
            </section>

            <section className="section-card pad-lg stack-md">
              <h2 style={{ margin: 0 }}>Runbook links</h2>
              <div className="timeline-actions">
                <Link className="mini-button" href="/onboarding">Open onboarding</Link>
                <Link className="mini-button" href="/setup">Open setup</Link>
                <Link className="mini-button" href="/analytics">Open analytics</Link>
              </div>
              <div className="kicker">
                Use this page as the organization-level readiness view before beta rollout or staff onboarding.
              </div>
            </section>
          </section>
        </>
      ) : null}
    </section>
  );
}
