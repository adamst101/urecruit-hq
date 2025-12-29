/**
 * Migration function: Old model → New model
 * Run this once to migrate existing Favorite/Registration data to CampIntent
 */

export default async function migrateToNewModel(context) {
  const { base44, user } = context;
  
  if (!user || user.role !== 'admin') {
    return { error: 'Admin only' };
  }

  const results = {
    athleteProfiles: 0,
    campIntents: 0,
    constraints: 0,
    scenarios: 0,
    errors: []
  };

  try {
    // Get all users
    const users = await base44.entities.User.list();

    for (const u of users) {
      // Skip if no athlete data
      if (!u.athlete_name) continue;

      // 1. Create AthleteProfile
      const athleteProfile = await base44.entities.AthleteProfile.create({
        account_id: u.id,
        athlete_name: u.athlete_name,
        sport_id: u.sport_id,
        grad_year: u.grad_year || new Date().getFullYear() + 1,
        primary_position_id: u.primary_position_id,
        secondary_position_ids: u.secondary_position_ids || [],
        home_zip: u.home_zip,
        search_radius_miles: u.radius_miles,
        division_preferences: u.division_preferences || [],
        active: true
      });
      results.athleteProfiles++;

      // 2. Create default constraints
      await base44.entities.TravelConstraint.create({
        athlete_id: athleteProfile.id,
        max_distance_miles: u.radius_miles || 500,
        travel_mode: 'driving'
      });

      await base44.entities.BudgetConstraint.create({
        athlete_id: athleteProfile.id,
        total_budget: 5000,
        cost_warning_threshold: 80
      });

      await base44.entities.CalendarConstraint.create({
        athlete_id: athleteProfile.id,
        recovery_days_between_camps: 1,
        blackout_dates: []
      });
      results.constraints += 3;

      // 3. Create default scenario
      await base44.entities.Scenario.create({
        athlete_id: athleteProfile.id,
        scenario_name: 'My Plan',
        is_primary: true
      });
      results.scenarios++;

      // 4. Migrate Favorites to CampIntent
      const favorites = await base44.entities.Favorite.filter({ user_id: u.id });
      for (const fav of favorites) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteProfile.id,
          camp_id: fav.camp_id,
          status: 'favorite',
          priority: 'medium'
        });
        results.campIntents++;
      }

      // 5. Migrate Registrations to CampIntent
      const registrations = await base44.entities.Registration.filter({ user_id: u.id });
      for (const reg of registrations) {
        // Check if already exists from favorite migration
        const existing = await base44.entities.CampIntent.filter({
          athlete_id: athleteProfile.id,
          camp_id: reg.camp_id
        });

        if (existing.length > 0) {
          // Update existing
          await base44.entities.CampIntent.update(existing[0].id, {
            status: reg.status,
            registration_confirmed: true,
            priority: 'high'
          });
        } else {
          // Create new
          await base44.entities.CampIntent.create({
            athlete_id: athleteProfile.id,
            camp_id: reg.camp_id,
            status: reg.status,
            registration_confirmed: true,
            priority: 'high'
          });
          results.campIntents++;
        }
      }
    }

    return { success: true, results };
  } catch (error) {
    results.errors.push(error.message);
    return { success: false, results, error: error.message };
  }
}