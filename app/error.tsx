"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="shell error-page">
      <p className="eyebrow">Something went wrong</p>
      <h1>We couldn’t load the game library.</h1>
      <p>Check the database connection and try again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
