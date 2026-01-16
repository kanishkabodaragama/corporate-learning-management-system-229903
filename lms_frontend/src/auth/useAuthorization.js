import { useMemo } from "react";
import { useAuth } from "./AuthContext";
import { isRoleAllowed, normalizeRole } from "./roles";

// PUBLIC_INTERFACE
/**
 * Roles-aware helper hook built on top of AuthContext.
 *
 * @returns {{
 *  role: "admin" | "instructor" | "learner",
 *  roleSource: "profiles" | "metadata" | "default",
 *  isRoleLoading: boolean,
 *  roleLoadError: string | null,
 *  isProfilesTableMissing: boolean,
 *  canAccess: (allowedRoles: Array<"admin" | "instructor" | "learner">) => boolean,
 * }}
 */
export function useAuthorization() {
  const { role, roleSource, isRoleLoading, roleLoadError, isProfilesTableMissing } = useAuth();

  return useMemo(() => {
    const normalizedRole = normalizeRole(role);

    return {
      role: normalizedRole,
      roleSource,
      isRoleLoading,
      roleLoadError,
      isProfilesTableMissing,
      canAccess: (allowedRoles) => isRoleAllowed(normalizedRole, allowedRoles),
    };
  }, [role, roleSource, isRoleLoading, roleLoadError, isProfilesTableMissing]);
}
