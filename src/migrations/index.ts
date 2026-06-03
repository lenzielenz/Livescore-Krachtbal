import * as migration_20260531_233344_initial from './20260531_233344_initial';
import * as migration_20260531_234903_goal_area_depth from './20260531_234903_goal_area_depth';
import * as migration_20260531_235726_clubs_hierarchy from './20260531_235726_clubs_hierarchy';
import * as migration_20260601_172424_wedstrijdblad from './20260601_172424_wedstrijdblad';
import * as migration_20260601_194920_reeks_veld from './20260601_194920_reeks_veld';
import * as migration_20260601_205849_club_gegevens from './20260601_205849_club_gegevens';
import * as migration_20260601_210208_team_thuisuur from './20260601_210208_team_thuisuur';
import * as migration_20260601_212043_officials_functies from './20260601_212043_officials_functies';
import * as migration_20260602_043213_club_logo_url from './20260602_043213_club_logo_url';
import * as migration_20260602_090000_vergoeding_ongeval_bekerfinale from './20260602_090000_vergoeding_ongeval_bekerfinale';
import * as migration_20260602_120000_club_logo_fit from './20260602_120000_club_logo_fit';
import * as migration_20260602_130000_club_kleuren from './20260602_130000_club_kleuren';
import * as migration_20260602_140000_unlock_demo from './20260602_140000_unlock_demo';
import * as migration_20260602_194302_tornooi from './20260602_194302_tornooi';
import * as migration_20260602_220000_kantine_selectie from './20260602_220000_kantine_selectie';
import * as migration_20260602_230000_vaste_opstelling from './20260602_230000_vaste_opstelling';
import * as migration_20260603_090000_forfait_uitslag from './20260603_090000_forfait_uitslag';
import * as migration_20260603_120000_sr_vrijgave from './20260603_120000_sr_vrijgave';
import * as migration_20260603_140000_tornooi_format from './20260603_140000_tornooi_format';
import * as migration_20260603_160000_tornooi_kruisjes_timeouts from './20260603_160000_tornooi_kruisjes_timeouts';

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
    name: '20260601_212043_officials_functies',
  },
  {
    up: migration_20260602_043213_club_logo_url.up,
    down: migration_20260602_043213_club_logo_url.down,
    name: '20260602_043213_club_logo_url',
  },
  {
    up: migration_20260602_090000_vergoeding_ongeval_bekerfinale.up,
    down: migration_20260602_090000_vergoeding_ongeval_bekerfinale.down,
    name: '20260602_090000_vergoeding_ongeval_bekerfinale',
  },
  {
    up: migration_20260602_120000_club_logo_fit.up,
    down: migration_20260602_120000_club_logo_fit.down,
    name: '20260602_120000_club_logo_fit',
  },
  {
    up: migration_20260602_130000_club_kleuren.up,
    down: migration_20260602_130000_club_kleuren.down,
    name: '20260602_130000_club_kleuren',
  },
  {
    up: migration_20260602_140000_unlock_demo.up,
    down: migration_20260602_140000_unlock_demo.down,
    name: '20260602_140000_unlock_demo',
  },
  {
    up: migration_20260602_194302_tornooi.up,
    down: migration_20260602_194302_tornooi.down,
    name: '20260602_194302_tornooi'
  },
  {
    up: migration_20260602_220000_kantine_selectie.up,
    down: migration_20260602_220000_kantine_selectie.down,
    name: '20260602_220000_kantine_selectie',
  },
  {
    up: migration_20260602_230000_vaste_opstelling.up,
    down: migration_20260602_230000_vaste_opstelling.down,
    name: '20260602_230000_vaste_opstelling',
  },
  {
    up: migration_20260603_090000_forfait_uitslag.up,
    down: migration_20260603_090000_forfait_uitslag.down,
    name: '20260603_090000_forfait_uitslag',
  },
  {
    up: migration_20260603_120000_sr_vrijgave.up,
    down: migration_20260603_120000_sr_vrijgave.down,
    name: '20260603_120000_sr_vrijgave',
  },
  {
    up: migration_20260603_140000_tornooi_format.up,
    down: migration_20260603_140000_tornooi_format.down,
    name: '20260603_140000_tornooi_format',
  },
  {
    up: migration_20260603_160000_tornooi_kruisjes_timeouts.up,
    down: migration_20260603_160000_tornooi_kruisjes_timeouts.down,
    name: '20260603_160000_tornooi_kruisjes_timeouts',
  },
];
