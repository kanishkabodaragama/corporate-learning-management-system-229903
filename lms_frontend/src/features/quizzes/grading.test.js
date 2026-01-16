import { gradeQuizAttempt } from "./grading";

test("gradeQuizAttempt scores single-choice correctly", () => {
  const quiz = {
    questions: [
      {
        id: "q1",
        prompt: "2+2?",
        question_type: "single",
        options: [
          { id: "o1", label: "3", is_correct: false },
          { id: "o2", label: "4", is_correct: true },
        ],
      },
    ],
  };

  const result = gradeQuizAttempt(quiz, { q1: ["o2"] });
  expect(result.totalQuestions).toBe(1);
  expect(result.correctCount).toBe(1);
  expect(result.scorePercent).toBe(100);
  expect(result.items[0].is_correct).toBe(true);
});

test("gradeQuizAttempt requires exact match for multi-select", () => {
  const quiz = {
    questions: [
      {
        id: "q1",
        prompt: "Select primes",
        question_type: "multi",
        options: [
          { id: "o1", label: "2", is_correct: true },
          { id: "o2", label: "3", is_correct: true },
          { id: "o3", label: "4", is_correct: false },
        ],
      },
    ],
  };

  const partial = gradeQuizAttempt(quiz, { q1: ["o1"] });
  expect(partial.correctCount).toBe(0);

  const exact = gradeQuizAttempt(quiz, { q1: ["o1", "o2"] });
  expect(exact.correctCount).toBe(1);
  expect(exact.scorePercent).toBe(100);
});
