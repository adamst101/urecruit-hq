// src/pages/AdminImport.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

import {
  toISODate,
  computeSeasonYearFootball,
  seedProgramId,
  buildEventKey,
  simpleHash,
  normalizePrice
} from "../components/utils/ingestUtils";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Map your ingestion record -> Base44 Camp entity payload (occurrence model)
 *
 * Expected raw fields (you can paste JSON from your ingestor):
 * - school_id, sport_id (required)
 * - name (required), event_start_date (required), event_end_date
 * - program_id (optional; Ryzer stable series id preferred)
 * - registration_url, source_url, source_platform
 * - position_ids, city, state
 * - price_raw, price_min, price_max
 * - event_dates_raw, grades_raw, register_by_raw, sections_json, notes
 */
function mapRawToCampPayload(raw) {
  const camp_name = raw?.name || raw?.camp_name || "";
  const school_id = raw?.school_id || null;
  const sport_id = raw?.sport_id || null;

  const start_date = toISODate(raw?.event_start_date || raw?.start_date);
  const end_date = toISODate(raw?.event_end_date || raw?.end_date);

  const position_ids = Array.isArray(raw?.position_ids) ? raw.position_ids : [];
  const city = raw?.city || null;
  const state = raw?.state || null;

  const link_url = raw?.registration_url || raw?.link_url || null;
  const source_platform = raw?.source_platform || "ryzer";
  const source_url = raw?.source_url || link_url || null;

  // program_id: use Ryzer program_id when present; otherwise deterministic seed
  const program_id =
    raw?.program_id && String(raw.program_id).trim()
      ? String(raw.program_id).trim()
      : seedProgramId({ school_id, camp_name });

  // Football Feb 1 rollover for now (your stated MVP rule)
  const season_year = computeSeasonYearFootball(start_date);

  // event_key: unique per occurrence
  const event_key = buildEventKey({
    source_platform,
    program_id,
    start_date,
    link_url,
    source_url
  });

  const { price_min, price_max, price } = normalizePrice({
    price_min: raw?.price_min,
    price_max: raw?.price_max,
    price_raw: raw?.price_raw
  });

  const sections_json = raw?.sections_json || null;

  const hashInput = {
    school_id,
    sport_id,
    program_id,
    camp_name,
    start_date,
    end_date,
    city,
    state,
    position_ids,
    link_url,
    source_platform,
    source_url,
    event_dates_raw: raw?.event_dates_raw || "",
    grades_raw: raw?.grades_raw || "",
    register_by_raw: raw?.register_by_raw || "",
    price_raw: raw?.price_raw || "",
    price_min,
    price_max,
    notes: raw?.notes || "",
    sections_json
  };

  const now = new Date().toISOString();

  return {
    // Required by your Camp schema
    school_id,
    sport_id,
    camp_name,
    start_date,

    // Existing optional fields in your Camp schema
    end_date: end_date || null,
    city,
    state,
    position_ids,
    price: price ?? null,
    link_url,
    notes: raw?.notes || null,

    // MVP ingestion fields (must exist in Camp entity after Step 1)
    season_year,
    program_id,
    event_key,
    source_platform,
    source_url,
    last_seen_at: now,
    content_hash: simpleHash(hashInput),

    // Nice-to-have (must exist in Camp entity if you added them)
    event_dates_raw: raw?.event_dates_raw || null,
    grades_raw: raw?.grades_raw || null,
    register_by_raw: raw?.register_by_raw || null,
    price_raw: raw?.price_raw || null,
    price_min: price_min ?? null,
    price_max: price_max ?? null,
    sections_json
  };
}

async function upsertCampByEventKey(payload) {
  const event_key = payload?.event_key;
  if (!event_key) throw new Error("Missing event_key");

  let existing = [];
  try {
    existing = await base44.entities.Camp.filter({ event_key }, "-start_date", 1);
  } catch {
    try {
      existing = await base44.entities.Camp.filter({ event_key });
    } catch {
      existing = [];
    }
  }

  const row = Array.isArray(existing) ? existing[0] : null;

  // Create
  if (!row?.id) {
    const created = await base44.entities.Camp.create(payload);
    return { action: "created", id: created?.id || null };
  }

  // Update only if changed, always touch last_seen_at
  const patch = { last_seen_at: payload.last_seen_at };
  const oldHash = String(row?.content_hash || "");
  const newHash = String(payload?.content_hash || "");

  if (oldHash !== newHash) Object.assign(patch, payload);

  await base44.entities.Camp.update(row.id, patch);
  return { action: oldHash !== newHash ? "updated" : "touched", id: row.id };
}

export default function AdminImport() {
  const nav = useNavigate();
  const season = useSeasonAccess();
  const signedIn = !!season?.accountId;

  const [input, setInput] = useState(
    `[
  {
    "program_id": "RYZER-PROGRAM-123",
    "school_id": "69407156fe19c36159448662",
    "sport_id": "69407156fe19c3615944865f",
    "name": "Elite Prospect Camp",
    "event_start_date": "6/14/2025",
    "event_end_date": "6/15/2025",
    "city": "Tuscaloosa",
    "state": "AL",
    "position_ids": ["69407162fe19c36159448680"],
    "price_raw": "$75",
    "registration_url": "https://rolltide.com/camps",
    "source_platform": "ryzer",
    "source_url": "https://ryzer.com/example/camp/123"
  }
]`
  );

  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState({ created: 0, updated: 0, touched: 0, failed: 0 });

  const parsed = useMemo(() => safeJsonParse(input), [input]);

  const push = (m) => setLog((x) => [...x, m]);

  const run = async () => {
    setLog([]);
    setSummary({ created: 0, updated: 0, touched: 0, failed: 0 });

    if (!signedIn) {
      push("❌ You must be signed in (owner-create policy) to write Camp records.");
      push("Tip: go to Home → Log in, then return to AdminImport.");
      return;
    }

    if (!parsed.ok) {
      push(`❌ Invalid JSON: ${parsed.error}`);
      return;
    }

    const records = asArray(parsed.value);
    if (!records.length) {
      push("❌ Expected an array of records (JSON).");
      return;
    }

    setWorking(true);
    push(`Starting ingestion for ${records.length} record(s)…`);

    const counts = { created: 0, updated: 0, touched: 0, failed: 0 };

    try {
      for (let i = 0; i < records.length; i++) {
        const raw = records[i];

        try {
          const payload = mapRawToCampPayload(raw);

          // Required guardrails
          if (!payload.school_id || !payload.sport_id || !payload.camp_name || !payload.start_date) {
            counts.failed += 1;
            push(
              `❌ [${i + 1}] missing required: school_id / sport_id / name(camp_name) / event_start_date(start_date)`
            );
            continue;
          }

          if (!payload.season_year) {
            counts.failed += 1;
            push(`❌ [${i + 1}] season_year could not be computed (bad start_date)`);
            continue;
          }

          if (!payload.event_key) {
            counts.failed += 1;
            push(`❌ [${i + 1}] event_key could not be built`);
            continue;
          }

          const res = await upsertCampByEventKey(payload);
          counts[res.action] += 1;

          push(
            `✅ [${i + 1}] ${res.action.toUpperCase()} | season_year=${payload.season_year} | start=${payload.start_date} | key=${payload.event_key}`
          );
        } catch (e) {
          counts.failed += 1;
          push(`❌ [${i + 1}] error: ${String(e?.message || e)}`);
        }
      }
    } finally {
      setWorking(false);
      setSummary(counts);
      push(`Done. created=${counts.created}, updated=${counts.updated}, touched=${counts.touched}, failed=${counts.failed}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
          <Button
            variant="outline"
            onClick={() => nav(createPageUrl("Home"))}
          >
            Back to Home
          </Button>
        </div>

        <Card className="p-4">
          <div className="text-sm text-slate-600">
            Paste JSON (array) and run ingestion. This will normalize dates, compute football season_year (Feb 1 rollover),
            generate program_id + event_key, and upsert into <b>Camp</b> by event_key.
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Signed in: <b>{String(!!signedIn)}</b> · accountId:{" "}
            <b>{season?.accountId ? String(season.accountId) : "null"}</b>
          </div>

          <textarea
            className="mt-3 w-full h-72 font-mono text-xs p-3 border rounded-lg"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />

          {!parsed.ok ? (
            <div className="mt-2 text-sm text-rose-700">JSON error: {parsed.error}</div>
          ) : null}

          <div className="mt-3 flex gap-2 items-center">
            <Button onClick={run} disabled={working}>
              {working ? "Running…" : "Run Ingestion"}
            </Button>

            <Button
              variant="outline"
              disabled={working}
              onClick={() => {
                setLog([]);
                setSummary({ created: 0, updated: 0, touched: 0, failed: 0 });
              }}
            >
              Clear output
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Summary</div>
          <div className="mt-2 text-sm text-slate-700">
            created: <b>{summary.created}</b> · updated: <b>{summary.updated}</b> · touched: <b>{summary.touched}</b> ·
            failed: <b>{summary.failed}</b>
          </div>

          <pre className="mt-3 text-xs bg-white border rounded-lg p-3 overflow-auto whitespace-pre-wrap">
            {log.join("\n")}
          </pre>
        </Card>
      </div>
    </div>
  );
}