import * as migration_20260531_233344_initial from './20260531_233344_initial';
import * as migration_20260531_234903_goal_area_depth from './20260531_234903_goal_area_depth';
import * as migration_20260531_235726_clubs_hierarchy from './20260531_235726_clubs_hierarchy';
import * as migration_20260601_172424_wedstrijdblad from './20260601_172424_wedstrijdblad';
import * as migration_20260601_194920_reeks_veld from './20260601_194920_reeks_veld';

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
    name: '20260601_194920_reeks_veld'
  },
];
