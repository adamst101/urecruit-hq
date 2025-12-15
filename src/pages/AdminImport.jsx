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

export default function AdminImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState('');
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
    mutationFn: async (data) => {
      const campsArray = Array.isArray(data) ? data : [data];
      const results = [];

      for (const campData of campsArray) {
        // Find or create school
        let school = schools.find(s => 
          s.school_name?.toLowerCase() === campData.school_name?.toLowerCase()
        );
        
        if (!school && campData.school_name) {
          school = await base44.entities.School.create({
            school_name: campData.school_name,
            division: campData.division || 'Other',
            conference: campData.conference || '',
            city: campData.city || '',
            state: campData.state || '',
            logo_url: campData.logo_url || ''
          });
        }

        // Find sport
        let sport = sports.find(s => 
          s.sport_name?.toLowerCase() === campData.sport_name?.toLowerCase()
        );
        
        if (!sport) {
          // Default to Football if not specified
          sport = sports.find(s => s.sport_name === 'Football');
        }

        // Process positions
        const positionIds = [];
        if (campData.positions && Array.isArray(campData.positions)) {
          for (const posCode of campData.positions) {
            let position = positions.find(p => 
              p.position_code === posCode && p.sport_id === sport.id
            );
            
            if (!position) {
              // Create new position if doesn't exist
              position = await base44.entities.Position.create({
                sport_id: sport.id,
                position_code: posCode,
                position_name: posCode // Default name to code
              });
            }
            
            positionIds.push(position.id);
          }
        }

        // Create camp
        const camp = await base44.entities.Camp.create({
          school_id: school?.id,
          sport_id: sport?.id,
          camp_name: campData.camp_name,
          start_date: campData.start_date,
          end_date: campData.end_date || campData.start_date,
          city: campData.city || '',
          state: campData.state || '',
          position_ids: positionIds,
          price: campData.price || 0,
          link_url: campData.link_url || '',
          notes: campData.notes || ''
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
      setJsonInput('');
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
      const data = JSON.parse(jsonInput);
      importMutation.mutate(data);
    } catch (error) {
      setResult({
        success: false,
        message: `Invalid JSON: ${error.message}`,
        error
      });
    }
  };

  const exampleJSON = `{
  "school_name": "University of Example",
  "division": "FBS",
  "conference": "Big Example",
  "city": "Example City",
  "state": "EX",
  "sport_name": "Football",
  "camp_name": "Summer Skills Camp",
  "start_date": "2025-06-15",
  "end_date": "2025-06-16",
  "positions": ["QB", "WR", "DB"],
  "price": 75,
  "link_url": "https://example.com/register",
  "notes": "Elite camp for skill position players."
}`;

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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Admin: Import Camps</h1>
          <p className="text-slate-600">
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