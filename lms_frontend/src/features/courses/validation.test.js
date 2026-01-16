import { validateCourseInput } from "./validation";

test("validateCourseInput requires a title", () => {
  const result = validateCourseInput({ title: "" });
  expect(result.isValid).toBe(false);
  expect(result.errors.title).toMatch(/required/i);
});

test("validateCourseInput validates owner UUID when provided", () => {
  const result = validateCourseInput({ title: "Safety", owner_id: "not-a-uuid" });
  expect(result.isValid).toBe(false);
  expect(result.errors.owner_id).toMatch(/uuid/i);
});

test("validateCourseInput accepts a basic valid payload", () => {
  const result = validateCourseInput({ title: "Workplace Safety 101" });
  expect(result.isValid).toBe(true);
});
