/**
 * Demo Mode helpers.
 *
 * Demo Mode is enabled only when:
 * - REACT_APP_DEMO_MODE === "true"
 * - and NOT in production (REACT_APP_NODE_ENV !== "production")
 *
 * Note: we also treat NODE_ENV==="production" as production for extra safety.
 */

export const DEMO_SESSION_STORAGE_KEY = "lms_demo_session_v1";

export const DEMO_ACCOUNTS = [
  { role: "admin", email: "admin@demo.lms", password: "Admin!234", label: "Admin" },
  { role: "instructor", email: "instructor@demo.lms", password: "Instructor!234", label: "Instructor" },
  { role: "learner", email: "student@demo.lms", password: "Student!234", label: "Student" },
];

function toBoolEnv(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "true";
}

// PUBLIC_INTERFACE
/**
 * Returns whether Demo Mode is enabled for this build/runtime.
 *
 * @returns {boolean}
 */
export function isDemoModeEnabled() {
  const requested = toBoolEnv(process.env.REACT_APP_DEMO_MODE);

  // Per requirements: force Demo Mode off in production builds via REACT_APP_NODE_ENV.
  // Extra guard: also treat NODE_ENV==="production" as production.
  const isProduction =
    String(process.env.REACT_APP_NODE_ENV || "").toLowerCase() === "production" ||
    String(process.env.NODE_ENV || "").toLowerCase() === "production";

  return requested && !isProduction;
}

// PUBLIC_INTERFACE
/**
 * Find a demo account by credentials. Returns null when credentials do not match.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{role:"admin"|"instructor"|"learner", email:string, password:string, label:string} | null}
 */
export function findDemoAccount(email, password) {
  const e = String(email || "").trim().toLowerCase();
  const p = String(password || "");
  const hit = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === e && a.password === p);
  return hit || null;
}
