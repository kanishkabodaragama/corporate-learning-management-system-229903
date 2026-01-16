import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders dashboard scaffold", async () => {
  render(<App />);
  const heading = await screen.findByRole("heading", { name: /dashboard/i });
  expect(heading).toBeInTheDocument();
});
