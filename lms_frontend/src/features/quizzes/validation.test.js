import { validateQuizInput } from "./validation";

test("validateQuizInput requires a title", () => {
  const result = validateQuizInput({ title: "", questions: [] });
  expect(result.isValid).toBe(false);
  expect(result.errors.title).toMatch(/required/i);
});

test("validateQuizInput requires at least one question", () => {
  const result = validateQuizInput({ title: "Safety Quiz", questions: [] });
  expect(result.isValid).toBe(false);
  expect(result.errors.questions).toMatch(/at least one question/i);
});

test("validateQuizInput enforces correct option rules for single", () => {
  const result = validateQuizInput({
    title: "Quiz",
    questions: [
      {
        prompt: "What is 2+2?",
        question_type: "single",
        options: [
          { label: "3", is_correct: false },
          { label: "4", is_correct: false },
        ],
      },
    ],
  });

  expect(result.isValid).toBe(false);
  expect(result.errors.questionErrors?.[0]?.correct).toMatch(/exactly one correct/i);
});

test("validateQuizInput accepts a basic valid quiz", () => {
  const result = validateQuizInput({
    title: "Basics",
    questions: [
      {
        prompt: "Select the correct answer",
        question_type: "single",
        options: [
          { label: "A", is_correct: true },
          { label: "B", is_correct: false },
        ],
      },
    ],
  });

  expect(result.isValid).toBe(true);
});
