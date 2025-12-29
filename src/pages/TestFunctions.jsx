import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function TestFunctions() {
  const [testResults, setTestResults] = useState(null);

  const { data: athleteProfile } = useQuery({
    queryKey: ['athleteProfile'],
    queryFn: () => base44.functions.getAthleteProfile()
  });

  const testGetCampSummaries = async () => {
    setTestResults({ status: 'loading' });
    try {
      const result = await base44.functions.getCampSummaries({
        athlete_id: athleteProfile?.id,
        limit: 10
      });
      setTestResults({ 
        status: 'success', 
        data: result,
        count: result.length 
      });
    } catch (error) {
      setTestResults({ 
        status: 'error', 
        error: error.message 
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-deep-navy mb-6">Function Tests</h1>

        {/* Athlete Profile Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-xl font-bold mb-4">Athlete Profile</h2>
          {athleteProfile ? (
            <pre className="bg-slate-50 p-4 rounded text-xs overflow-auto">
              {JSON.stringify(athleteProfile, null, 2)}
            </pre>
          ) : (
            <p className="text-slate-500">No athlete profile found</p>
          )}
        </div>

        {/* Test getCampSummaries */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">getCampSummaries Test</h2>
          
          <Button 
            onClick={testGetCampSummaries}
            disabled={!athleteProfile}
            className="mb-4"
          >
            Run Test
          </Button>

          {testResults && (
            <div className="mt-4">
              {testResults.status === 'loading' && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Testing...</span>
                </div>
              )}

              {testResults.status === 'success' && (
                <div>
                  <div className="flex items-center gap-2 text-green-600 mb-4">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Success! Found {testResults.count} camp summaries</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded overflow-auto max-h-96">
                    <pre className="text-xs">{JSON.stringify(testResults.data, null, 2)}</pre>
                  </div>
                </div>
              )}

              {testResults.status === 'error' && (
                <div>
                  <div className="flex items-center gap-2 text-red-600 mb-2">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-semibold">Error</span>
                  </div>
                  <div className="bg-red-50 p-4 rounded text-sm text-red-700">
                    {testResults.error}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}