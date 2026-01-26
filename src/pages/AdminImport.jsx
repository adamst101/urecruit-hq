// src/pages/AdminImport.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

// ---------- Inline helpers (no external imports) ----------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Return YYYY-MM-DD (UTC) or null
function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = String(mdy[1]).padStart(2, "0");
      const dd = String(mdy[2]).padStart(2, "0");
      const yyyy = String(mdy[3]);
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Football rollover: Feb 1 (UTC)
function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  const d = new Date(`${startDateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}

function simpleHash(obj) {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj ?? {});
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}

function seedProgramId({ school_id, camp_name }) {
  return `seed:${String(school_id || "na")}:${slugify(camp_name || "camp")}`;
}

function buildEventKey({ source_platform, program_id, start_date, link_url, source_url }) {
  const platform = source_platform || "seed";
  const disc = link_url || source_url || "na";
  return `${platform}:${program_id}:${start_date || "na"}:${disc}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
// --------------------------------------------------------

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

  const appendLog = (line) => setLog((prev) => (prev ? prev + "\n" + line : line));

  async function upsertCampByEventKey(payload) {
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
    const runIso = new Date().toISOString();

    setWorking(true);
    setLog("");
    setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendLog(`Starting: Promote CampDemo → Camp @ ${runIso}`);

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

    // 2) Transform + upsert
    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];

      try {
        const school_id = r?.school_id || null;
        const sport_id = r?.sport_id || null;
        const camp_name = r?.camp_name || r?.name || null;

        const start_date = toISODate(r?.start_date);
        const end_date = toISODate(r?.end_date);

        if (!school_id || !sport_id || !camp_name || !start_date) {
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendLog(`SKIP #${i + 1}: missing required fields`);
          continue;
        }

        const season_year = computeSeasonYearFootball(start_date);

        const program_id = seedProgramId({ school_id, camp_name });
        const source_platform = "seed";
        const link_url = r?.link_url || r?.url || null;
        const source_url = r?.source_url || link_url || null;

        const event_key = buildEventKey({
          source_platform,
          program_id,
          start_date,
          link_url,
          source_url
        });

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

        const payload = {
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

          season_year,
          program_id,
          event_key,
          source_platform,
          source_url: source_url || null,
          last_seen_at: runIso,
          content_hash
        };

        const result = await upsertCampByEventKey(payload);

        if (result === "created") setStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) appendLog(`Progress: ${i + 1}/${demoRows.length}`);

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
              Promote CampDemo rows into Camp (one-time) so Discover demo can read Camp by season.
            </div>
          </div>

          <Button variant="outline" onClick={() => nav(createPageUrl("Home"))}>
            Back to Home
          </Button>
        </div>

        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>.
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
