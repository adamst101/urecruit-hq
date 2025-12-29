/**
 * Backend function: Get enriched camp summaries with pre-joined data
 * Replaces client-side joins of Camp/School/Sport/Favorite/Registration
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
  } = params;

  // Build camp query
  const campQuery = {};
  if (sport_id) campQuery.sport_id = sport_id;
  if (start_date_gte) campQuery.start_date = { $gte: start_date_gte };

  // Get camps
  const camps = await base44.entities.Camp.filter(campQuery, '-start_date', limit);

  // Get related data in batch
  const schoolIds = [...new Set(camps.map(c => c.school_id))];
  const schools = await base44.entities.School.filter({ id: { $in: schoolIds } });
  const schoolMap = Object.fromEntries(schools.map(s => [s.id, s]));

  const sportIds = [...new Set(camps.map(c => c.sport_id))];
  const sports = await base44.entities.Sport.filter({ id: { $in: sportIds } });
  const sportMap = Object.fromEntries(sports.map(s => [s.id, s]));

  const positions = await base44.entities.Position.list();
  const positionMap = Object.fromEntries(positions.map(p => [p.id, p]));

  // Get athlete-specific data if athlete_id provided
  let intentMap = {};
  let targetSchoolIds = new Set();
  let athleteProfile = null;

  if (athlete_id) {
    const intents = await base44.entities.CampIntent.filter({ athlete_id });
    intentMap = Object.fromEntries(intents.map(i => [i.camp_id, i]));

    const targets = await base44.entities.TargetSchool.filter({ athlete_id });
    targetSchoolIds = new Set(targets.map(t => t.school_id));

    const profiles = await base44.entities.AthleteProfile.filter({ id: athlete_id });
    athleteProfile = profiles[0] || null;
  }

  // Assemble summaries
  let summaries = camps.map(camp => {
    const school = schoolMap[camp.school_id];
    const sport = sportMap[camp.sport_id];
    const intent = intentMap[camp.id] || null;
    const campPositions = (camp.position_ids || []).map(pid => positionMap[pid]).filter(Boolean);

    return {
      // Camp data
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

      // School data
      school_id: school?.id,
      school_name: school?.school_name,
      school_division: school?.division,
      school_logo_url: school?.logo_url,
      school_city: school?.city,
      school_state: school?.state,
      school_conference: school?.conference,

      // Sport data
      sport_id: sport?.id,
      sport_name: sport?.sport_name,

      // Intent flags
      intent_status: intent?.status || null,
      intent_priority: intent?.priority || null,
      is_target_school: targetSchoolIds.has(camp.school_id),

      // Computed fields (placeholder - would need geocoding)
      distance_from_home: null,
      days_until_camp: camp.start_date ? Math.ceil((new Date(camp.start_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
    };
  });

  // Apply filters
  if (divisions?.length) {
    const divArray = Array.isArray(divisions) ? divisions : divisions.split(',');
    summaries = summaries.filter(s => divArray.includes(s.school_division));
  }

  if (states?.length) {
    const stateArray = Array.isArray(states) ? states : states.split(',');
    summaries = summaries.filter(s => stateArray.includes(s.state) || stateArray.includes(s.school_state));
  }

  if (position_ids?.length) {
    const posArray = Array.isArray(position_ids) ? position_ids : position_ids.split(',');
    summaries = summaries.filter(s => s.position_ids.some(pid => posArray.includes(pid)));
  }

  if (search) {
    const q = search.toLowerCase();
    summaries = summaries.filter(s =>
      s.camp_name?.toLowerCase().includes(q) ||
      s.school_name?.toLowerCase().includes(q)
    );
  }

  if (intent_status?.length) {
    const statusArray = Array.isArray(intent_status) ? intent_status : intent_status.split(',');
    summaries = summaries.filter(s => statusArray.includes(s.intent_status));
  }

  if (is_target_school !== undefined) {
    summaries = summaries.filter(s => s.is_target_school === (is_target_school === true || is_target_school === 'true'));
  }

  if (end_date_lte) {
    summaries = summaries.filter(s => s.start_date <= end_date_lte);
  }

  return summaries;
}