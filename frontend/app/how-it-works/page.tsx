import Link from 'next/link'
import Nav from '../components/Nav'
import NavUserActions from '../components/NavUserActions'

export const metadata = {
  title: 'How It Works | Job Matcher',
  description: 'Learn how Job Matcher helps you find jobs that fit your resume and preferences.',
}

const steps = [
  {
    num: 1,
    title: 'Upload Your Resume',
    body: 'Start by uploading your resume (PDF or DOCX). The system extracts your experience, skills, and background to create a profile. This profile is used to find jobs that match your qualifications.',
  },
  {
    num: 2,
    title: 'Rate Jobs in the Resume Tab',
    body: "You'll see jobs ranked by how well they match your resume. For each job, click Interested or Not Interested. This is the key step that many users miss:",
    highlight: 'Your ratings train a Taste Profile — a personalised model of what you like. The more you rate, the better the system understands your preferences. Jobs you mark as Interested teach it what to recommend; Not Interested teaches it what to avoid.',
  },
  {
    num: 3,
    title: 'Update Your Taste Profile',
    body: "After rating at least 3 jobs as Interested, click Update Taste Profile. This builds (or refreshes) your taste model from your ratings. Do this whenever you've added new ratings to keep recommendations up to date.",
  },
  {
    num: 4,
    title: 'Use the Taste Tab for Personalised Matches',
    body: "Once your taste profile is built, switch to the Taste tab. Here you'll get jobs ranked by your demonstrated preferences — not just resume overlap, but what you've shown you actually like. The more you rate in the Resume tab, the better the Taste tab becomes.",
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav rightSlot={<NavUserActions />} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">How Job Matcher Works</h1>
        <p className="text-slate-600 mb-12">
          A simple guide to getting the most out of your job search.
        </p>

        <div className="space-y-6">
          {steps.map(({ num, title, body, highlight }) => (
            <div
              key={num}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex gap-5"
            >
              <div className="shrink-0 w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-lg">
                {num}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
                <p className="text-slate-600 leading-relaxed">{body}</p>
                {highlight && (
                  <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                    <p className="text-indigo-900 font-medium mb-1">Why does rating matter?</p>
                    <p className="text-indigo-800 text-sm leading-relaxed">{highlight}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
            <h3 className="text-base font-semibold text-slate-900 mb-3">Summary</h3>
            <ul className="text-slate-600 space-y-2 text-sm">
              <li><strong className="text-slate-800">Resume tab</strong>: Rate jobs to train your taste. New users start here.</li>
              <li><strong className="text-slate-800">Taste tab</strong>: Get personalised recommendations once you&apos;ve rated enough jobs.</li>
              <li><strong className="text-slate-800">Interested / Not Interested</strong>: Every click helps narrow and improve your search.</li>
            </ul>
          </div>

          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  )
}
