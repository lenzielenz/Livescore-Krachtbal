import * as migration_20260531_233344_initial from './20260531_233344_initial';
import * as migration_20260531_234903_goal_area_depth from './20260531_234903_goal_area_depth';
import * as migration_20260531_235726_clubs_hierarchy from './20260531_235726_clubs_hierarchy';
import * as migration_20260601_172424_wedstrijdblad from './20260601_172424_wedstrijdblad';
import * as migration_20260601_194920_reeks_veld from './20260601_194920_reeks_veld';
import * as migration_20260601_205849_club_gegevens from './20260601_205849_club_gegevens';
import * as migration_20260601_210208_team_thuisuur from './20260601_210208_team_thuisuur';
import * as migration_20260601_212043_officials_functies from './20260601_212043_officials_functies';

export const migrations = [
  {
    up: migration_20260531_233344_initial.up,
    down: migration_20260531_233344_initial.down,
    name: '20260531_233344_initial',
  },
  {
    up: migration_20260531_234903_goal_area_depth.up,
    down: migration_20260531_234903_goal_area_depth.down,
    name: '20260531_234903_goal_area_depth',
  },
  {
    up: migration_20260531_235726_clubs_hierarchy.up,
    down: migration_20260531_235726_clubs_hierarchy.down,
    name: '20260531_235726_clubs_hierarchy',
  },
  {
    up: migration_20260601_172424_wedstrijdblad.up,
    down: migration_20260601_172424_wedstrijdblad.down,
    name: '20260601_172424_wedstrijdblad',
  },
  {
    up: migration_20260601_194920_reeks_veld.up,
    down: migration_20260601_194920_reeks_veld.down,
    name: '20260601_194920_reeks_veld',
  },
  {
    up: migration_20260601_205849_club_gegevens.up,
    down: migration_20260601_205849_club_gegevens.down,
    name: '20260601_205849_club_gegevens',
  },
  {
    up: migration_20260601_210208_team_thuisuur.up,
    down: migration_20260601_210208_team_thuisuur.down,
    name: '20260601_210208_team_thuisuur',
  },
  {
    up: migration_20260601_212043_officials_functies.up,
    down: migration_20260601_212043_officials_functies.down,
    name: '20260601_212043_officials_functies'
  },
];
