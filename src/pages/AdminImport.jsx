// src/pages/AdminImport.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { createPageUrl } from "../utils";
import { useNavigate } from "react-router-dom";

import {
  toISODate,
  computeSeasonYearFootball,
  seedProgramId,
  buildEventKey,
  simpleHash
} from "../components/utils/ingestUtils.jsx";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function AdminImport() {
  const nav = useNavigate();

  const [working, setWorking] = useState(false);
  const [log, setLog] = useState("");
  const [stats, setStats] = useState({
    read: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  });

  const appendLog = (line) => {
    setLog((prev) => (prev ? prev + "\n" + line : line));
  };

  const nowIso = useMemo(() => new Date().toISOString(), []);

  async function upsertCampByEventKey(payload) {
    // Base44 pattern: filter then create/update
    const key = payload?.event_key;
    if (!key) throw new Error("Missing event_key for upsert");

    let existing = [];
    try {
      existing = await base44.entities.Camp.filter({ event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0]?.id) {
      await base44.entities.Camp.update(arr[0].id, payload);
      return "updated";
    } else {
      await base44.entities.Camp.create(payload);
      return "created";
    }
  }

  async function promoteCampDemoToCamp() {
    setWorking(true);
    setLog("");
    setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendLog("Starting: Promote CampDemo → Camp");

    // 1) Read all CampDemo
    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({}));
    } catch (e) {
      appendLog(`ERROR reading CampDemo: ${String(e?.message || e)}`);
      setWorking(false);
      return;
    }

    appendLog(`Found CampDemo rows: ${demoRows.length}`);
    setStats((s) => ({ ...s, read: demoRows.length }));

    // 2) Transform + upsert (small throttling to avoid rate limits)
    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];

      try {
        const school_id = r?.school_id || null;
        const sport_id = r?.sport_id || null;
        const camp_name = r?.camp_name || r?.name || null;

        const start_date = toISODate(r?.start_date);
        const end_date = toISODate(r?.end_date);

        // Required fields for Camp entity
        if (!school_id || !sport_id || !camp_name || !start_date) {
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendLog(`SKIP #${i + 1}: missing required fields (school_id/sport_id/camp_name/start_date)`);
          continue;
        }

        // Football season_year
        const season_year = computeSeasonYearFootball(start_date);

        // Deterministic program_id + event_key for seed data
        const program_id = seedProgramId({ school_id, camp_name });
        const source_platform = "seed";
        const source_url = r?.link_url || r?.source_url || null;
        const link_url = r?.link_url || null;

        const event_key = buildEventKey({
          source_platform,
          program_id,
          start_date,
          link_url,
          source_url
        });

        // Content hash for change detection (simple MVP)
        const content_hash = simpleHash({
          school_id,
          sport_id,
          camp_name,
          start_date,
          end_date,
          city: r?.city || null,
          state: r?.state || null,
          position_ids: r?.position_ids || [],
          price: r?.price ?? null,
          link_url: link_url || null,
          notes: r?.notes || null
        });

        // Payload aligns with your Camp schema + MVP fields
        const payload = {
          // existing Camp fields
          school_id,
          sport_id,
          camp_name,
          start_date,
          end_date: end_date || null,
          city: r?.city || null,
          state: r?.state || null,
          position_ids: asArray(r?.position_ids),
          price: typeof r?.price === "number" ? r.price : null,
          link_url: link_url || null,
          notes: r?.notes || null,

          // new MVP fields (must exist on Camp entity)
          season_year,
          program_id,
          event_key,
          source_platform,
          source_url: source_url || null,
          last_seen_at: nowIso,
          content_hash
        };

        const result = await upsertCampByEventKey(payload);

        if (result === "created") setStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) appendLog(`Progress: ${i + 1}/${demoRows.length}`);

        // throttle a bit (Base44 can be sensitive)
        await sleep(60);
      } catch (e) {
        setStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendLog(`ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    appendLog("Done.");
    setWorking(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">
              MVP tool: Promote CampDemo rows into Camp so Discover demo can read Camp by season.
            </div>
          </div>

          <Button variant="outline" onClick={() => nav(createPageUrl("Home"))}>
            Back to Home
          </Button>
        </div>

        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Copies all CampDemo rows into Camp, computes <b>season_year</b> via Feb 1 rule, and upserts by <b>event_key</b>.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={working}>
              {working ? "Running…" : "Run Promotion"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setLog("");
                setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
              }}
              disabled={working}
            >
              Clear
            </Button>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {stats.read}</span>
              <span><b>Created:</b> {stats.created}</span>
              <span><b>Updated:</b> {stats.updated}</span>
              <span><b>Skipped:</b> {stats.skipped}</span>
              <span><b>Errors:</b> {stats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
{log || "—"}
            </pre>
          </div>
        </Card>
      </div>
    </div>
  );
}
