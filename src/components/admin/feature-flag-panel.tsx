import { getFeatureMatrix, getLaunchProfileName } from "@/lib/features/runtime";

export function FeatureFlagPanel() {
  const profile = getLaunchProfileName();
  const flags = getFeatureMatrix();

  return (
    <section className="section-card pad-lg stack-md">
      <div className="entry-header">
        <div>
          <h2 style={{ margin: 0 }}>Feature flags</h2>
          <p className="kicker">
            Launch control is code-based for V1. Switch profiles with <code>APP_LAUNCH_PROFILE</code> and{" "}
            <code>NEXT_PUBLIC_APP_LAUNCH_PROFILE</code>.
          </p>
        </div>
        <span className="chip">{profile}</span>
      </div>
      <div className="table-like">
        {flags.map((flag) => (
          <div className="timeline-card" key={flag.key}>
            <div className="timeline-top">
              <strong>{flag.label}</strong>
              <span className="mono">{flag.enabled ? "enabled" : "hidden"}</span>
            </div>
            <div className="pill-row">
              <span className="chip">{flag.key}</span>
              <span className="chip">{flag.category.replaceAll("_", " ")}</span>
              {flag.organizationOverridable ? <span className="chip">org-ready later</span> : null}
            </div>
            <div className="kicker">{flag.description}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

