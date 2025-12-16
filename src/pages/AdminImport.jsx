import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const mapDivision = (csvDivision) => {
  if (!csvDivision) return 'Other';
  const div = csvDivision.toUpperCase();
  if (div.includes('FBS')) return 'FBS';
  if (div.includes('FCS')) return 'FCS';
  if (div.includes('DII') || div.includes('D2')) return 'D2';
  if (div.includes('DIII') || div.includes('D3')) return 'D3';
  if (div.includes('NAIA')) return 'NAIA';
  return 'Other';
};

const parseCsv = (csv) => {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split('\t').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split('\t');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i]?.trim() || '';
    });
    return obj;
  });
};

export default function AdminImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [csvInput, setCsvInput] = useState('');
  const [result, setResult] = useState(null);

  const { data: sports = [] } = useQuery({
    queryKey: ['sports'],
    queryFn: () => base44.entities.Sport.list()
  });

  const { data: schools = [] } = useQuery({
    queryKey: ['schools'],
    queryFn: () => base44.entities.School.list()
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.Position.list()
  });

  const importMutation = useMutation({
    mutationFn: async (csvData) => {
      const results = [];
      const football = sports.find(s => s.sport_name === 'Football');

      for (const row of csvData) {
        // Find or create school
        let school = schools.find(s => 
          s.school_name?.toLowerCase().trim() === row.School?.toLowerCase().trim()
        );
        
        if (!school && row.School) {
          school = await base44.entities.School.create({
            school_name: row.School.trim(),
            division: mapDivision(row.Division),
            city: row.City?.trim() || '',
            state: row.State?.trim() || ''
          });
        }

        if (!school || !football) continue;

        // Parse date (format: M/D/YYYY)
        const dateParts = row.Date?.split('/');
        let startDate = '';
        if (dateParts && dateParts.length === 3) {
          const [month, day, year] = dateParts;
          startDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        // Create camp
        const camp = await base44.entities.Camp.create({
          school_id: school.id,
          sport_id: football.id,
          camp_name: row['Camp Name']?.trim() || 'Camp',
          start_date: startDate,
          end_date: startDate,
          city: row.City?.trim() || '',
          state: row.State?.trim() || '',
          position_ids: [],
          price: 0,
          link_url: row['Registration Link']?.trim() || '',
          notes: row['Position Specifics']?.trim() || ''
        });

        results.push(camp);
      }

      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['camps'] });
      queryClient.invalidateQueries({ queryKey: ['schools'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      setResult({
        success: true,
        message: `Successfully imported ${data.length} camp(s)`,
        data
      });
      setCsvInput('');
      toast.success(`Imported ${data.length} camp(s)`);
    },
    onError: (error) => {
      setResult({
        success: false,
        message: `Error: ${error.message}`,
        error
      });
      toast.error('Import failed');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setResult(null);
    
    try {
      const data = parseCsv(csvInput);
      importMutation.mutate(data);
    } catch (error) {
      setResult({
        success: false,
        message: `Error parsing CSV: ${error.message}`,
        error
      });
    }
  };

  const exampleCSV = `Camp Name\tSchool\tDivision\tDate\tCity\tState\tRegistration Link\tPosition Specifics
Summer Skills Camp\tUniversity of Example\tDI (FBS)\t6/15/2025\tExample City\tEX\thttps://example.com\tAll`;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <h1 className="text-3xl font-bold text-deep-navy mb-2">Admin: Import Camps</h1>
          <p className="text-gray-dark">
            Import camps from JSON data. Supports single camp objects or arrays of camps.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <Label htmlFor="json-input" className="text-lg font-semibold mb-2 block">
              Camp Data (JSON)
            </Label>
            <Textarea
              id="json-input"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={exampleJSON}
              className="min-h-[300px] font-mono text-sm"
            />

            <Button
              type="submit"
              disabled={!jsonInput || importMutation.isPending}
              className="w-full mt-4 bg-electric-blue hover:bg-deep-navy"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Camps
                </>
              )}
            </Button>
          </div>

          {/* Result */}
          {result && (
            <Alert className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <AlertDescription className={result.success ? "text-green-800" : "text-red-800"}>
                {result.message}
              </AlertDescription>
            </Alert>
          )}
        </form>

        {/* Example */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mt-6">
          <h2 className="text-lg font-semibold mb-3">Example JSON Format</h2>
          <pre className="bg-slate-50 rounded-lg p-4 text-xs overflow-x-auto">
            {exampleJSON}
          </pre>
          <p className="text-sm text-slate-600 mt-3">
            <strong>For multiple camps:</strong> wrap in an array: <code className="bg-slate-100 px-1 py-0.5 rounded">[{'{...}'}, {'{...}'}]</code>
          </p>
          <div className="mt-3 text-sm text-slate-600">
            <p className="font-semibold mb-1">Notes:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>If school doesn't exist, it will be created</li>
              <li>If positions don't exist for the sport, they'll be created</li>
              <li>Sport defaults to Football if not specified</li>
              <li>Division must be one of: FBS, FCS, D2, D3, NAIA, Other</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}