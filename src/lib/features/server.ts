import { isFeatureEnabled } from "@/lib/features/runtime";
import type { FeatureKey } from "@/lib/features/definitions";

export class FeatureDisabledError extends Error {
  constructor(public feature: FeatureKey) {
    super(`Feature "${feature}" is disabled in the active launch profile.`);
  }
}

export function assertFeatureEnabled(feature: FeatureKey) {
  if (!isFeatureEnabled(feature)) {
    throw new FeatureDisabledError(feature);
  }
}
