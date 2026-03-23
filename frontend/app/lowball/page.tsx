'use client'

import AuthGate from '../components/AuthGate'
import { LowballContent } from './LowballContent'

export default function LowballPage() {
  return (
    <AuthGate>
      {() => <LowballContent />}
    </AuthGate>
  )
}
