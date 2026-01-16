import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { DEMO_SESSION_STORAGE_KEY } from "./auth/demoMode";

function setEnv(key, value) {
  if (value === undefined) {
    // eslint-disable-next-line no-param-reassign
    delete process.env[key];
  } else {
    // eslint-disable-next-line no-param-reassign
    process.env[key] = value;
  }
}

const ORIGINAL_DEMO_MODE = process.env.REACT_APP_DEMO_MODE;
const ORIGINAL_NODE_ENV = process.env.REACT_APP_NODE_ENV;

afterEach(() => {
  // Restore env for isolation
  setEnv("REACT_APP_DEMO_MODE", ORIGINAL_DEMO_MODE);
  setEnv("REACT_APP_NODE_ENV", ORIGINAL_NODE_ENV);

  // Clear any persisted demo session between tests
  window.localStorage.clear();
});

test("renders login screen when unauthenticated", async () => {
  setEnv("REACT_APP_DEMO_MODE", "false");
  setEnv("REACT_APP_NODE_ENV", "development");

  render(<App />);
  const heading = await screen.findByRole("heading", { name: /sign in/i });
  expect(heading).toBeInTheDocument();
});

test("demo mode admin login sets role to admin and routes to /dashboard", async () => {
  setEnv("REACT_APP_DEMO_MODE", "true");
  setEnv("REACT_APP_NODE_ENV", "development");

  render(<App />);

  const emailInput = await screen.findByLabelText(/email/i);
  const passwordInput = screen.getByLabelText(/password/i);

  fireEvent.change(emailInput, { target: { value: "admin@demo.lms" } });
  fireEvent.change(passwordInput, { target: { value: "Admin!234" } });

  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  // Navigation success
  const dashboardHeading = await screen.findByRole("heading", { name: /dashboard/i });
  expect(dashboardHeading).toBeInTheDocument();

  // Role success (topbar shows current role)
  const roleChip = screen.getByLabelText(/current role/i);
  expect(roleChip).toHaveTextContent(/admin/i);
});

test("demo mode logout clears demo session and routes to /login", async () => {
  setEnv("REACT_APP_DEMO_MODE", "true");
  setEnv("REACT_APP_NODE_ENV", "development");

  render(<App />);

  const emailInput = await screen.findByLabelText(/email/i);
  const passwordInput = screen.getByLabelText(/password/i);

  fireEvent.change(emailInput, { target: { value: "admin@demo.lms" } });
  fireEvent.change(passwordInput, { target: { value: "Admin!234" } });

  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  // Confirm we're signed in
  await screen.findByRole("heading", { name: /dashboard/i });
  expect(window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeTruthy();

  // Logout button uses aria-label="Sign out"
  fireEvent.click(await screen.findByRole("button", { name: /sign out/i }));

  // Confirm redirected to login and demo session removed
  await screen.findByRole("heading", { name: /sign in/i });
  expect(window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeNull();
});
