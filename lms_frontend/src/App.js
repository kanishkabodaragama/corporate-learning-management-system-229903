import React, { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { applyThemeCssVariables } from "./theme";

import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

import AppLayout from "./components/AppLayout";

import DashboardPage from "./pages/DashboardPage";
import CoursesPage from "./pages/CoursesPage";
import SessionsPage from "./pages/SessionsPage";
import EnrollmentsPage from "./pages/EnrollmentsPage";
import AttendancePage from "./pages/AttendancePage";
import QuizzesPage from "./pages/QuizzesPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";

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
                <Route path="courses" element={<CoursesPage />} />
                <Route path="sessions" element={<SessionsPage />} />
                <Route path="enrollments" element={<EnrollmentsPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="quizzes" element={<QuizzesPage />} />
                <Route path="approvals" element={<ApprovalsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
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
