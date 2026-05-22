export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-blue-600">NYC 311 Quick-File</span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Describe your problem. We&apos;ll find the right 311 complaint.
        </h1>
        <p className="text-base text-neutral-600 dark:text-neutral-400">
          Tell us what&apos;s wrong in plain language. We figure out the right
          complaint type, prepare a paste-ready submission with a direct link to
          the form, and answer questions from the official NYC 311 knowledge
          base.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        🚧 Scaffold in place. Chat UI and the classify / answer / lookup flows
        are wired up next (Phases 1–5 in <code>nyc-311-implementation.md</code>).
      </div>
    </main>
  );
}
