/**
 * Backend function: Get enriched camp summaries with pre-joined data
 * Replaces client-side joins of Camp/School/Sport/Position + CampIntent/TargetSchool flags
 */
export default async function getCampSummaries(context) {
  const { base44, params } = context;
  const {
    athlete_id,
    sport_id,
    divisions,
    states,
    position_ids,
    start_date_gte,
    end_date_lte,
    search,
    intent_status,
    is_target_school,
    limit = 200
  } = params || {};

  // -----------------------------
  // 1) Build base camp query (push what we can into DB)
  // -----------------------------
  const campQuery = {};
  if (sport_id) campQuery.sport_id = sport_id;

  // camp.state filter in DB
  if (states?.length) {
    const stateArray = Array.isArray(states) ? states : String(states).split(',');
    campQuery.state = { $in: stateArray.map(s => s.trim()).filter(Boolean) };
  }

  // NOTE: We intentionally do NOT apply start_date_gte/end_date_lte in DB
  // because correct overlap behavior requires camp end_date handling.
  // We'll do window overlap filtering after join.

  // -----------------------------
  // 2) Fetch camps (upcoming first)
  // -----------------------------
  const camps = await base44.entities.Camp.filter(
    campQuery,
    'start_date',
    Number(limit) || 200
  );

  // -----------------------------
  // 3) Batch fetch related data (School, Sport)
  // -----------------------------
  const schoolIds = [...new Set(camps.map(c => c.school_id).filter(Boolean))];
  const schools = schoolIds.length
    ? await base44.entities.School.filter({ id: { $in: schoolIds } })
    : [];
  const schoolMap = Object.fromEntries(schools.map(s => [s.id, s]));

  const sportIds = [...new Set(camps.map(c => c.sport_id).filter(Boolean))];
  const sports = sportIds.length
    ? await base44.entities.Sport.filter({ id: { $in: sportIds } })
    : [];
  const sportMap = Object.fromEntries(sports.map(s => [s.id, s]));

  // -----------------------------
  // 4) Fetch ONLY positions referenced by these camps
  // -----------------------------
  const allPosIds = [
    ...new Set(
      camps
        .flatMap(c => c.position_ids || [])
        .map(x => String(x))
        .filter(Boolean)
    )
  ];

  const positions = allPosIds.length
    ? await base44.entities.Position.filter({ id: { $in: allPosIds } })
    : [];
  const positionMap = Object.fromEntries(positions.map(p => [p.id, p]));

  // -----------------------------
  // 5) Athlete-specific data (CampIntent + TargetSchool)
  // -----------------------------
  let intentMap = {};
  let targetSchoolIds = new Set();

  if (athlete_id) {
    const intents = await base44.entities.CampIntent.filter({ athlete_id });
    intentMap = Object.fromEntries(intents.map(i => [i.camp_id, i]));

    const targets = await base44.entities.TargetSchool.filter({ athlete_id });
    targetSchoolIds = new Set(targets.map(t => t.school_id));
  }

  // -----------------------------
  // 6) Assemble summaries
  // -----------------------------
  let summaries = camps.map(camp => {
    const school = schoolMap[camp.school_id];
    const sport = sportMap[camp.sport_id];
    const intent = intentMap[camp.id] || null;

    const campPositions = (camp.position_ids || [])
      .map(pid => positionMap[pid])
      .filter(Boolean);

    const campStart = camp.start_date ? new Date(camp.start_date) : null;
    const campEnd = camp.end_date ? new Date(camp.end_date) : campStart;

    return {
      // Camp
      camp_id: camp.id,
      camp_name: camp.camp_name,
      start_date: camp.start_date,
      end_date: camp.end_date,
      price: camp.price,
      link_url: camp.link_url,
      notes: camp.notes,
      city: camp.city,
      state: camp.state,
      position_ids: camp.position_ids || [],
      position_codes: campPositions.map(p => p.position_code),

      // School
      school_id: school?.id,
      school_name: school?.school_name,
      school_division: school?.division,
      school_logo_url: school?.logo_url,
      school_city: school?.city,
      school_state: school?.state,
      school_conference: school?.conference,

      // Sport
      sport_id: sport?.id,
      sport_name: sport?.sport_name,

      // Intent flags
      intent_status: intent?.status || null,
      intent_priority: intent?.priority || null,
      is_target_school: targetSchoolIds.has(camp.school_id),

      // Computed placeholders
      distance_from_home: null,
      days_until_camp: campStart ? Math.ceil((campStart - new Date()) / 86400000) : null,

      // Internal for overlap filtering
      _campStart: campStart,
      _campEnd: campEnd
    };
  });

  // -----------------------------
  // 7) Apply filters that need joined data/arrays
  // -----------------------------
  if (divisions?.length) {
    const divArray = Array.isArray(divisions) ? divisions : String(divisions).split(',');
    const divSet = new Set(divArray.map(d => d.trim()).filter(Boolean));
    summaries = summaries.filter(s => divSet.has(s.school_division));
  }

  if (position_ids?.length) {
    const posArray = Array.isArray(position_ids) ? position_ids : String(position_ids).split(',');
    const posSet = new Set(posArray.map(p => p.trim()).filter(Boolean));
    summaries = summaries.filter(s => (s.position_ids || []).some(pid => posSet.has(String(pid))));
  }

  // NOTE: school_state filtering (if user passes states for school location)
  // camp.state was filtered in DB above; this preserves compatibility if camps have missing state.
  if (states?.length) {
    const stateArray = Array.isArray(states) ? states : String(states).split(',');
    const stateSet = new Set(stateArray.map(s => s.trim()).filter(Boolean));
    summaries = summaries.filter(s => stateSet.has(s.state) || stateSet.has(s.school_state));
  }

  if (search) {
    const q = String(search).toLowerCase();
    summaries = summaries.filter(s =>
      (s.camp_name || '').toLowerCase().includes(q) ||
      (s.school_name || '').toLowerCase().includes(q)
    );
  }

  if (intent_status?.length) {
    const statusArray = Array.isArray(intent_status) ? intent_status : String(intent_status).split(',');
    const statusSet = new Set(statusArray.map(x => x.trim()).filter(Boolean));
    summaries = summaries.filter(s => statusSet.has(s.intent_status));
  }

  if (is_target_school !== undefined) {
    const boolVal = (is_target_school === true || is_target_school === 'true');
    summaries = summaries.filter(s => s.is_target_school === boolVal);
  }

  // Date window overlap (handles multi-day camps)
  if (start_date_gte || end_date_lte) {
    const windowStart = start_date_gte ? new Date(start_date_gte) : null;
    const windowEnd = end_date_lte ? new Date(end_date_lte) : null;

    summaries = summaries.filter(s => {
      const a = s._campStart;
      const b = s._campEnd;
      if (!a || !b) return true;

      // Camp ends before window starts
      if (windowStart && b < windowStart) return false;
      // Camp starts after window ends
      if (windowEnd && a > windowEnd) return false;

      return true;
    });
  }

  // -----------------------------
  // 8) Strip internal fields and return
  // -----------------------------
  summaries = summaries.map(({ _campStart, _campEnd, ...rest }) => rest);

  return summaries;
}