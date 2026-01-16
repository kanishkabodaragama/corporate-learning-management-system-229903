import React from "react";
import { Link } from "react-router-dom";

// PUBLIC_INTERFACE
export default function NotFoundPage() {
  return (
    <section className="page" aria-label="Not found">
      <header>
        <h1 className="pageTitle">Page not found</h1>
        <p className="pageDesc">
          The page you’re looking for doesn’t exist. Use navigation or return to the
          dashboard.
        </p>
      </header>

      <div className="card">
        <div className="cardTitle">Navigation</div>
        <p className="cardBody">
          <Link className="inlineLink" to="/dashboard">
            Back to Dashboard
          </Link>
        </p>
      </div>
    </section>
  );
}
