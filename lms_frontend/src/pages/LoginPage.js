import React from "react";
import { Link } from "react-router-dom";

// PUBLIC_INTERFACE
export default function LoginPage() {
  return (
    <div className="authWrap">
      <section className="authCard" aria-label="Login">
        <h1 className="authTitle">Sign in</h1>
        <p className="authHint">
          Authentication will be implemented with Supabase next. For now, use the button
          below to access the scaffolded dashboard.
        </p>

        <Link to="/dashboard" className="inlineLink" style={{ display: "none" }}>
          Go to dashboard
        </Link>

        <Link to="/dashboard" style={{ textDecoration: "none" }}>
          <button type="button" className="primaryButton">
            Continue to Dashboard
          </button>
        </Link>
      </section>
    </div>
  );
}
