/**
 * Backend function: Get day-level summary for calendar rendering
 */

export default async function getAthleteDayOverlay(context) {
  const { base44, params } = context;
  const { athlete_id, month } = params; // month format: "2025-06"

  if (!athlete_id || !month) {
    return { error: 'athlete_id and month required' };
  }

  const [year, monthNum] = month.split('-');
  const startDate = `${year}-${monthNum.padStart(2, '0')}-01`;
  const endDate = `${year}-${monthNum.padStart(2, '0')}-31`;

  // Get athlete's intents
  const intents = await base44.entities.CampIntent.filter({
    athlete_id,
    status: { $in: ['favorite', 'registered', 'completed'] }
  });

  const campIds = intents.map(i => i.camp_id);

  // Get camps in date range
  const camps = await base44.entities.Camp.filter({
    id: { $in: campIds },
    start_date: { $gte: startDate, $lte: endDate }
  });

  // Build day map
  const dayMap = {};

  camps.forEach(camp => {
    const intent = intents.find(i => i.camp_id === camp.id);
    const startDay = camp.start_date.split('T')[0];

    if (!dayMap[startDay]) {
      dayMap[startDay] = {
        date: startDay,
        registered_count: 0,
        favorite_count: 0,
        considering_count: 0,
        has_conflicts: false,
        total_cost: 0,
        camp_ids: []
      };
    }

    dayMap[startDay].camp_ids.push(camp.id);

    if (intent.status === 'registered' || intent.status === 'completed') {
      dayMap[startDay].registered_count++;
      dayMap[startDay].total_cost += camp.price || 0;
    } else if (intent.status === 'favorite') {
      dayMap[startDay].favorite_count++;
    } else if (intent.status === 'considering') {
      dayMap[startDay].considering_count++;
    }

    // Simple conflict detection: more than 1 registered on same day
    if (dayMap[startDay].registered_count > 1) {
      dayMap[startDay].has_conflicts = true;
    }
  });

  return Object.values(dayMap);
}