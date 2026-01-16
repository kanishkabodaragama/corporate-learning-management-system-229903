import { validateSessionInput } from "./validation";

test("validateSessionInput requires course, title, and start time", () => {
  const result = validateSessionInput({
    course_id: "",
    title: "",
    starts_at_local: "",
  });

  expect(result.isValid).toBe(false);
  expect(result.errors.course_id).toBeTruthy();
  expect(result.errors.title).toBeTruthy();
  expect(result.errors.starts_at_local).toBeTruthy();
});

test("validateSessionInput enforces end > start", () => {
  const result = validateSessionInput({
    course_id: "11111111-1111-4111-8111-111111111111",
    title: "Session",
    starts_at_local: "2026-01-16T10:00",
    ends_at_local: "2026-01-16T09:59",
  });

  expect(result.isValid).toBe(false);
  expect(result.errors.ends_at_local).toMatch(/after/i);
});

test("validateSessionInput accepts valid payload", () => {
  const result = validateSessionInput({
    course_id: "11111111-1111-4111-8111-111111111111",
    title: "Session",
    starts_at_local: "2026-01-16T10:00",
    ends_at_local: "2026-01-16T11:00",
    capacity: "25",
  });

  expect(result.isValid).toBe(true);
});
