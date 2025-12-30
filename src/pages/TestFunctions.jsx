import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function TestFunctions() {
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-deep-navy mb-6">Function Tests</h1>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-amber-900 mb-2">
                Backend Functions Deprecated
              </h2>
              <p className="text-amber-800 mb-3">
                The following backend functions have been removed:
              </p>
              <ul className="list-disc list-inside text-amber-800 space-y-1 mb-3">
                <li><code className="bg-amber-100 px-2 py-0.5 rounded">base44.functions.getAthleteProfile()</code></li>
                <li><code className="bg-amber-100 px-2 py-0.5 rounded">base44.functions.getCampSummaries()</code></li>
                <li><code className="bg-amber-100 px-2 py-0.5 rounded">base44.functions.getAthleteDayOverlay()</code></li>
              </ul>
              <p className="text-amber-800">
                All data fetching now happens client-side using <code className="bg-amber-100 px-2 py-0.5 rounded">base44.entities.*</code> and the <code className="bg-amber-100 px-2 py-0.5 rounded">useAthleteIdentity()</code> hook.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}