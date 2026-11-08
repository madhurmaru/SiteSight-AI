"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <h1>Something interrupted this view.</h1>
      <p>Your saved records are safe. Try loading the workspace again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
