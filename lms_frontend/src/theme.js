/**
 * Ocean Professional theme tokens (centralized).
 * The CSS consumes these via CSS variables (applied at runtime by applyThemeCssVariables()).
 */
export const oceanProfessionalTheme = {
  name: "Ocean Professional",
  colors: {
    primary: "#374151",
    secondary: "#9CA3AF",
    success: "#10B981",
    error: "#EF4444",
    background: "#FFFFFF",
    surface: "#F9FAFB",
    text: "#111827",
  },
};

/**
 * PUBLIC_INTERFACE
 * Apply theme tokens as CSS variables on document.documentElement.
 *
 * This allows us to keep styling framework-free (pure CSS), while still having a centralized
 * theme definition that can evolve (multi-theme, dark mode, etc.).
 *
 * @param {typeof oceanProfessionalTheme} [theme] theme object to apply
 * @returns {void}
 */
export function applyThemeCssVariables(theme = oceanProfessionalTheme) {
  const root = document.documentElement;

  root.style.setProperty("--color-primary", theme.colors.primary);
  root.style.setProperty("--color-secondary", theme.colors.secondary);
  root.style.setProperty("--color-success", theme.colors.success);
  root.style.setProperty("--color-error", theme.colors.error);

  root.style.setProperty("--color-background", theme.colors.background);
  root.style.setProperty("--color-surface", theme.colors.surface);
  root.style.setProperty("--color-text", theme.colors.text);

  // Derived tokens (kept here so CSS remains minimal).
  root.style.setProperty("--color-border", "rgba(17, 24, 39, 0.10)");
  root.style.setProperty("--color-primary-soft", "rgba(55, 65, 81, 0.10)");
  root.style.setProperty("--color-primary-softer", "rgba(55, 65, 81, 0.06)");
}
