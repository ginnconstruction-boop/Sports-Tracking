import type { CSSProperties } from "react";

export type OrganizationBranding = {
  organizationId: string;
  name: string;
  slug: string;
  publicDisplayName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  wordmarkPath?: string | null;
};

export function brandingCssVariables(branding?: Partial<OrganizationBranding> | null) {
  if (!branding) {
    return undefined;
  }

  return {
    "--brand-primary": branding.primaryColor ?? "#13221b",
    "--brand-secondary": branding.secondaryColor ?? "#f2eadc",
    "--brand-accent": branding.accentColor ?? "#d18d1f"
  } as CSSProperties;
}
