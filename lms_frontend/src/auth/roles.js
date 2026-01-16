export const ROLES = {
  ADMIN: "admin",
  INSTRUCTOR: "instructor",
  LEARNER: "learner",
};

export const ROLE_OPTIONS = Object.values(ROLES);
export const DEFAULT_ROLE = ROLES.LEARNER;

// PUBLIC_INTERFACE
/**
 * Validate that a role is one of the supported roles.
 *
 * @param {any} role
 * @returns {role is "admin" | "instructor" | "learner"}
 */
export function isValidRole(role) {
  return typeof role === "string" && ROLE_OPTIONS.includes(role);
}

// PUBLIC_INTERFACE
/**
 * Normalize any input role into a supported role. Defaults to "learner".
 *
 * @param {any} role
 * @returns {"admin" | "instructor" | "learner"}
 */
export function normalizeRole(role) {
  if (typeof role !== "string") return DEFAULT_ROLE;
  const lowered = role.toLowerCase().trim();
  return isValidRole(lowered) ? lowered : DEFAULT_ROLE;
}

// PUBLIC_INTERFACE
/**
 * Attempt to read role from Supabase Auth user metadata.
 * (Supports both user_metadata and app_metadata; defaults to null if missing/invalid.)
 *
 * @param {any} user Supabase auth user
 * @returns {("admin" | "instructor" | "learner") | null}
 */
export function getRoleFromUserMetadata(user) {
  const candidate = user?.user_metadata?.role ?? user?.app_metadata?.role;
  if (!candidate) return null;
  const normalized = normalizeRole(candidate);
  // If candidate exists but normalizes to DEFAULT_ROLE, we still only accept it
  // when it was already valid; otherwise treat as missing.
  return isValidRole(typeof candidate === "string" ? candidate.toLowerCase().trim() : candidate)
    ? normalized
    : null;
}

// PUBLIC_INTERFACE
/**
 * Check whether `role` is allowed for a set of `allowedRoles`.
 *
 * @param {("admin" | "instructor" | "learner") | null | undefined} role
 * @param {Array<"admin" | "instructor" | "learner">} allowedRoles
 * @returns {boolean}
 */
export function isRoleAllowed(role, allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  const normalized = normalizeRole(role);
  return allowedRoles.includes(normalized);
}

export function titleCaseRole(role) {
  const normalized = normalizeRole(role);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
