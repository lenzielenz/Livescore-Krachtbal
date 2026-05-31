import * as migration_20260531_233344_initial from './20260531_233344_initial';

export const migrations = [
  {
    up: migration_20260531_233344_initial.up,
    down: migration_20260531_233344_initial.down,
    name: '20260531_233344_initial'
  },
];
