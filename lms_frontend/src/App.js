import React, { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { applyThemeCssVariables } from "./theme";

import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import RoleRequired from "./auth/RoleRequired";

import AppLayout from "./components/AppLayout";

import DashboardPage from "./pages/DashboardPage";
import CoursesPage from "./pages/CoursesPage";
import SessionsPage from "./pages/SessionsPage";
import EnrollmentsPage from "./pages/EnrollmentsPage";
import AttendancePage from "./pages/AttendancePage";

import EnrollmentsListPage from "./pages/enrollments/EnrollmentsListPage";
import EnrollmentDetailsPage from "./pages/enrollments/EnrollmentDetailsPage";
import EnrollmentAddPage from "./pages/enrollments/EnrollmentAddPage";

import AttendanceHomePage from "./pages/attendance/AttendanceHomePage";
import AttendanceTakePage from "./pages/attendance/AttendanceTakePage";
import QuizzesPage from "./pages/QuizzesPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";

import CoursesListPage from "./pages/courses/CoursesListPage";
import CourseDetailsPage from "./pages/courses/CourseDetailsPage";
import CourseFormPage from "./pages/courses/CourseFormPage";

import ApprovalsListPage from "./pages/approvals/ApprovalsListPage";
import ApprovalDetailsPage from "./pages/approvals/ApprovalDetailsPage";

import SessionsListPage from "./pages/sessions/SessionsListPage";
import SessionDetailsPage from "./pages/sessions/SessionDetailsPage";
import SessionFormPage from "./pages/sessions/SessionFormPage";

import QuizzesListPage from "./pages/quizzes/QuizzesListPage";
import QuizDetailsPage from "./pages/quizzes/QuizDetailsPage";
import QuizBuilderPage from "./pages/quizzes/QuizBuilderPage";
import QuizAssignPage from "./pages/quizzes/QuizAssignPage";
import QuizTakePage from "./pages/quizzes/QuizTakePage";
import QuizAttemptReviewPage from "./pages/quizzes/QuizAttemptReviewPage";

// PUBLIC_INTERFACE
function App() {
  /** Apply the centralized theme once on app start. */
  useEffect(() => {
    applyThemeCssVariables();
  }, []);

  return (
    <div className="appRoot">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected app shell + pages */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />

                <Route path="courses" element={<CoursesPage />}>
                  <Route index element={<CoursesListPage />} />
                  <Route path=":courseId" element={<CourseDetailsPage />} />
                  <Route
                    path="new"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <CourseFormPage mode="create" />
                      </RoleRequired>
                    }
                  />
                  <Route
                    path=":courseId/edit"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <CourseFormPage mode="edit" />
                      </RoleRequired>
                    }
                  />
                </Route>

                <Route path="sessions" element={<SessionsPage />}>
                  <Route index element={<SessionsListPage />} />
                  <Route path=":sessionId" element={<SessionDetailsPage />} />
                  <Route
                    path="new"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <SessionFormPage mode="create" />
                      </RoleRequired>
                    }
                  />
                  <Route
                    path=":sessionId/edit"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <SessionFormPage mode="edit" />
                      </RoleRequired>
                    }
                  />
                </Route>

                <Route path="enrollments" element={<EnrollmentsPage />}>
                  <Route index element={<EnrollmentsListPage />} />
                  <Route
                    path="new"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <EnrollmentAddPage />
                      </RoleRequired>
                    }
                  />
                  <Route path=":enrollmentId" element={<EnrollmentDetailsPage />} />
                </Route>

                <Route path="attendance" element={<AttendancePage />}>
                  <Route index element={<AttendanceHomePage />} />
                  <Route
                    path="sessions/:sessionId"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <AttendanceTakePage />
                      </RoleRequired>
                    }
                  />
                </Route>

                <Route path="quizzes" element={<QuizzesPage />}>
                  <Route index element={<QuizzesListPage />} />
                  <Route
                    path="new"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <QuizBuilderPage mode="create" />
                      </RoleRequired>
                    }
                  />
                  <Route path=":quizId" element={<QuizDetailsPage />} />
                  <Route
                    path=":quizId/edit"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <QuizBuilderPage mode="edit" />
                      </RoleRequired>
                    }
                  />
                  <Route
                    path=":quizId/assign"
                    element={
                      <RoleRequired allowedRoles={["admin", "instructor"]}>
                        <QuizAssignPage />
                      </RoleRequired>
                    }
                  />
                  <Route
                    path=":quizId/take"
                    element={
                      <RoleRequired allowedRoles={["learner"]}>
                        <QuizTakePage />
                      </RoleRequired>
                    }
                  />
                  <Route path="attempts/:attemptId" element={<QuizAttemptReviewPage />} />
                </Route>

                <Route path="approvals" element={<ApprovalsPage />}>
                  <Route index element={<ApprovalsListPage />} />
                  <Route path=":category/:requestId" element={<ApprovalDetailsPage />} />
                </Route>
                <Route
                  path="reports"
                  element={
                    <RoleRequired allowedRoles={["admin"]}>
                      <ReportsPage />
                    </RoleRequired>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RoleRequired allowedRoles={["admin"]}>
                      <SettingsPage />
                    </RoleRequired>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
