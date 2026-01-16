import React from "react";

/**
 * PUBLIC_INTERFACE
 * Generic placeholder page scaffold used until real feature implementations are added.
 *
 * @param {{title: string, description: string}} props
 * @returns {JSX.Element}
 */
export default function PlaceholderPage({ title, description }) {
  return (
    <section className="page" aria-label={title}>
      <header>
        <h1 className="pageTitle">{title}</h1>
        <p className="pageDesc">{description}</p>
      </header>

      <div className="card">
        <div className="cardTitle">Coming next</div>
        <p className="cardBody">
          This screen is scaffolded for navigation and layout. Data fetching and feature
          logic will be implemented in subsequent steps.
        </p>
      </div>
    </section>
  );
}
