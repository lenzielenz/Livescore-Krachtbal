import * as migration_20260531_233344_initial from './20260531_233344_initial';
import * as migration_20260531_234903_goal_area_depth from './20260531_234903_goal_area_depth';

export const migrations = [
  {
    up: migration_20260531_233344_initial.up,
    down: migration_20260531_233344_initial.down,
    name: '20260531_233344_initial',
  },
  {
    up: migration_20260531_234903_goal_area_depth.up,
    down: migration_20260531_234903_goal_area_depth.down,
    name: '20260531_234903_goal_area_depth'
  },
];
