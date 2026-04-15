import assert from "node:assert/strict";
import test from "node:test";
import {
  getPrivateBetaStatus,
  isEmailAllowedForPrivateBeta,
  isPrivateBetaInviteOnly
} from "@/lib/auth/private-beta";

test("private beta allowlist helper respects invite-only mode and email matching", () => {
  const previousInviteOnly = process.env.PRIVATE_BETA_INVITE_ONLY;
  const previousAllowlist = process.env.BETA_ALLOWLIST_EMAILS;

  process.env.PRIVATE_BETA_INVITE_ONLY = "true";
  process.env.BETA_ALLOWLIST_EMAILS = "coach@example.com, stat@example.com";

  assert.equal(isPrivateBetaInviteOnly(), true);
  assert.equal(isEmailAllowedForPrivateBeta("coach@example.com"), true);
  assert.equal(isEmailAllowedForPrivateBeta("COACH@example.com"), true);
  assert.equal(isEmailAllowedForPrivateBeta("other@example.com"), false);
  assert.equal(getPrivateBetaStatus().allowlistCount, 2);

  process.env.PRIVATE_BETA_INVITE_ONLY = previousInviteOnly;
  process.env.BETA_ALLOWLIST_EMAILS = previousAllowlist;
});
