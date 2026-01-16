import React from "react";
import { Link } from "react-router-dom";

// PUBLIC_INTERFACE
export default function UnauthorizedPage() {
  return (
    <section className="page" aria-label="Unauthorized">
      <header>
        <h1 className="pageTitle">Access denied</h1>
        <p className="pageDesc">
          You don’t have permission to view this page. If you believe this is an error, contact
          an administrator.
        </p>
      </header>

      <div className="card">
        <div className="cardTitle">Next steps</div>
        <p className="cardBody">
          <Link className="inlineLink" to="/dashboard">
            Go back to Dashboard
          </Link>
        </p>
      </div>
    </section>
  );
}
