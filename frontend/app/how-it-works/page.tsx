import Link from 'next/link'

export const metadata = {
  title: 'How It Works | Job Matcher',
  description: 'Learn how Job Matcher helps you find jobs that fit your resume and preferences.',
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            ← Back to Job Matcher
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">How Job Matcher Works</h1>
        <p className="text-gray-600 mb-12">
          A simple guide to getting the most out of your job search.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Upload Your Resume</h2>
            <p className="text-gray-600 leading-relaxed">
              Start by uploading your resume (PDF or DOCX). The system extracts your experience,
              skills, and background to create a profile. This profile is used to find jobs that
              match your qualifications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Rate Jobs in the Resume Tab</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              You&apos;ll see jobs ranked by how well they match your resume. For each job, click{' '}
              <strong className="text-emerald-600">Interested</strong> or{' '}
              <strong className="text-red-500">Not Interested</strong>. This is the key step that
              many users miss:
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <p className="text-blue-900 font-medium mb-2">
                Why does rating matter?
              </p>
              <p className="text-blue-800 text-sm leading-relaxed">
                Your ratings train a <strong>Taste Profile</strong> — a personalised model of what
                you like. The more you rate, the better the system understands your preferences.
                Jobs you mark as Interested teach it what to recommend; Not Interested teaches it
                what to avoid. This directly improves your future matches.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Update Your Taste Profile</h2>
            <p className="text-gray-600 leading-relaxed">
              After rating at least 3 jobs as Interested, click <strong>Update Taste Profile</strong>.
              This builds (or refreshes) your taste model from your ratings. Do this whenever you&apos;ve
              added new ratings to keep recommendations up to date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Use the Taste Tab for Personalised Matches</h2>
            <p className="text-gray-600 leading-relaxed">
              Once your taste profile is built, switch to the <strong>Taste</strong> tab. Here you&apos;ll
              get jobs ranked by your demonstrated preferences — not just resume overlap, but what
              you&apos;ve shown you actually like. The more you rate in the Resume tab, the better
              the Taste tab becomes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Summary</h2>
            <ul className="text-gray-600 space-y-2 list-disc list-inside">
              <li><strong>Resume tab</strong>: Rate jobs to train your taste. New users start here.</li>
              <li><strong>Taste tab</strong>: Get personalised recommendations once you&apos;ve rated enough jobs.</li>
              <li><strong>Interested / Not Interested</strong>: Every click helps narrow and improve your search.</li>
            </ul>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  )
}
