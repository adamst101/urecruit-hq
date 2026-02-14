// functions/seedSchoolsMaster_scorecard_v2.js
// Minimal deploy-probe under a NEW slug to bypass poisoned deployment artifacts.
// No fetch. No URL parsing. No regex. No writes.

function safeGetSecret(name) {
  try {
    const denoGet = globalThis && globalThis.Deno && globalThis.Deno.env && globalThis.Deno.env.get;
    if (typeof denoGet === "function") {
      const v = denoGet.call(globalThis.Deno.env, name);
      return v ? String(v) : null;
    }
  } catch (e) {}
  try {
    const v2 = globalThis && globalThis.process && globalThis.process.env ? globalThis.process.env[name] : null;
    return v2 ? String(v2) : null;
  } catch (e) {}
  return null;
}

export default async function seedSchoolsMaster_scorecard_v2(context) {
  const stats = { created: 0, updated: 0, skipped: 0, pages: 0 };

  const debug = {
    at: new Date().toISOString(),
    checks: {
      hasContext: !!context,
      hasBase44: !!context?.base44,
      hasEntities: !!context?.base44?.entities,
      schoolEntityName: null,
      schoolHasCreate: false,
      schoolHasUpdate: false,
      schoolHasFilter: false,
      scorecardKeyPresent: false,
    },
    notes: [],
  };

  try {
    const entities = context?.base44?.entities || null;
    const School = entities ? (entities.School || entities.Schools) : null;

    debug.checks.schoolEntityName = School ? (entities?.School ? "School" : "Schools") : null;
    debug.checks.schoolHasCreate = !!School?.create;
    debug.checks.schoolHasUpdate = !!School?.update;
    debug.checks.schoolHasFilter = !!School?.filter;

    const key = safeGetSecret("SCORECARD_API_KEY");
    debug.checks.scorecardKeyPresent = !!key;

    return { stats, debug };
  } catch (e) {
    debug.notes.push("Probe caught error: " + String(e?.message || e));
    return { error: String(e?.message || e), stats, debug };
  }
}