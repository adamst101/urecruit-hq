/**
 * Backend function: Get athlete profile for current user's account
 */

export default async function getAthleteProfile(context) {
  const { base44, user } = context;

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Get athlete profile for this account
  const profiles = await base44.entities.AthleteProfile.filter({
    account_id: user.id,
    active: true
  });

  if (profiles.length === 0) {
    return null;
  }

  const profile = profiles[0];

  // Get related constraints
  const [travelConstraints, budgetConstraints, calendarConstraints] = await Promise.all([
    base44.entities.TravelConstraint.filter({ athlete_id: profile.id }),
    base44.entities.BudgetConstraint.filter({ athlete_id: profile.id }),
    base44.entities.CalendarConstraint.filter({ athlete_id: profile.id })
  ]);

  return {
    ...profile,
    travel_constraint: travelConstraints[0] || null,
    budget_constraint: budgetConstraints[0] || null,
    calendar_constraint: calendarConstraints[0] || null
  };
}