function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseCsv(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isPrivateBetaInviteOnly() {
  return process.env.PRIVATE_BETA_INVITE_ONLY === "true";
}

export function getPrivateBetaAllowlist() {
  return new Set(parseCsv(process.env.BETA_ALLOWLIST_EMAILS).map(normalizeEmail));
}

export function isEmailAllowedForPrivateBeta(email?: string | null) {
  if (!isPrivateBetaInviteOnly()) {
    return true;
  }

  if (!email) {
    return false;
  }

  const allowlist = getPrivateBetaAllowlist();
  return allowlist.has(normalizeEmail(email));
}

export function getPrivateBetaStatus() {
  return {
    inviteOnly: isPrivateBetaInviteOnly(),
    allowlistCount: getPrivateBetaAllowlist().size
  };
}
