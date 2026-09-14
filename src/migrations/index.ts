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
import * as migration_20260603_180000_club_pakket from './20260603_180000_club_pakket';
import * as migration_20260603_190000_match_simple_score from './20260603_190000_match_simple_score';
import * as migration_20260603_200000_veld_scherm_selectie from './20260603_200000_veld_scherm_selectie';
import * as migration_20260604_090000_user_official from './20260604_090000_user_official';
import * as migration_20260604_100000_audit_pdf from './20260604_100000_audit_pdf';
import * as migration_20260604_120000_match_captain from './20260604_120000_match_captain';
import * as migration_20260604_130000_user_analyse_access from './20260604_130000_user_analyse_access';
import * as migration_20260604_140000_throw_caught_by from './20260604_140000_throw_caught_by';
import * as migration_20260605_090000_match_analyse_only from './20260605_090000_match_analyse_only';
import * as migration_20260605_100000_match_coach from './20260605_100000_match_coach';
import * as migration_20260606_072858_trainingmetingen from './20260606_072858_trainingmetingen';
import * as migration_20260606_080000_match_seizoen from './20260606_080000_match_seizoen';
import * as migration_20260606_081412_trainingen from './20260606_081412_trainingen';
import * as migration_20260606_090000_training_screenshot from './20260606_090000_training_screenshot';
import * as migration_20260606_093000_training_club from './20260606_093000_training_club';
import * as migration_20260606_100000_training_reeks from './20260606_100000_training_reeks';
import * as migration_20260606_110000_trainingdoelen from './20260606_110000_trainingdoelen';
import * as migration_20260606_120000_user_training_access from './20260606_120000_user_training_access';
import * as migration_20260607_120000_match_live_tribune from './20260607_120000_match_live_tribune';
import * as migration_20260607_140000_match_finished_at from './20260607_140000_match_finished_at';
import * as migration_20260607_160000_match_analyse_owner from './20260607_160000_match_analyse_owner';
import * as migration_20260607_180000_match_takeover from './20260607_180000_match_takeover';
import * as migration_20260607_200000_team_speelstijl from './20260607_200000_team_speelstijl';
import * as migration_20260607_220000_club_locatie from './20260607_220000_club_locatie';
import * as migration_20260608_120000_user_my_teams from './20260608_120000_user_my_teams';
import * as migration_20260608_140000_match_instants from './20260608_140000_match_instants';
import * as migration_20260608_160000_player_wing from './20260608_160000_player_wing';
import * as migration_20260608_180000_throw_tapped_by from './20260608_180000_throw_tapped_by';
import * as migration_20260608_200000_tournament_team_clubs from './20260608_200000_tournament_team_clubs';
import * as migration_20260609_120000_tournament_team_link from './20260609_120000_tournament_team_link';
import * as migration_20260609_140000_player_position_enum_fix from './20260609_140000_player_position_enum_fix';
import * as migration_20260609_160000_player_position_text from './20260609_160000_player_position_text';
import * as migration_20260609_180000_player_club from './20260609_180000_player_club';
import * as migration_20260609_200000_player_position_text_v2 from './20260609_200000_player_position_text_v2';
import * as migration_20260609_220000_team_display_title_backfill from './20260609_220000_team_display_title_backfill';
import * as migration_20260609_240000_official_user from './20260609_240000_official_user';
import * as migration_20260609_260000_analyse_entities from './20260609_260000_analyse_entities';
import * as migration_20260610_120000_user_official_backfill from './20260610_120000_user_official_backfill';
import * as migration_20260610_140000_club_display_title from './20260610_140000_club_display_title';
import * as migration_20260610_160000_lineup_confirmed from './20260610_160000_lineup_confirmed';
import * as migration_20260610_180000_keuring_bevestigd from './20260610_180000_keuring_bevestigd';
import * as migration_20260610_200000_analyse_delen from './20260610_200000_analyse_delen';
import * as migration_20260610_220000_wissel_events from './20260610_220000_wissel_events';
import * as migration_20260610_240000_analyse_delen_backfill from './20260610_240000_analyse_delen_backfill';
import * as migration_20260611_120000_push_subscriptions from './20260611_120000_push_subscriptions';
import * as migration_20260614_120000_match_live_poll from './20260614_120000_match_live_poll';
import * as migration_20260614_140000_match_score_predictions from './20260614_140000_match_score_predictions';
import * as migration_20260614_160000_club_pronostiek_pools from './20260614_160000_club_pronostiek_pools';
import * as migration_20260614_180000_tournament_toon_op_live from './20260614_180000_tournament_toon_op_live';
import * as migration_20260614_200000_match_pronostiek_bonus from './20260614_200000_match_pronostiek_bonus';
import * as migration_20260614_220000_user_pronostiek_power from './20260614_220000_user_pronostiek_power';
import * as migration_20260614_240000_user_nutrition_profile from './20260614_240000_user_nutrition_profile';
import * as migration_20260615_120000_user_profile from './20260615_120000_user_profile';
import * as migration_20260615_140000_user_scorecard from './20260615_140000_user_scorecard';
import * as migration_20260615_160000_advertenties from './20260615_160000_advertenties';
import * as migration_20260615_180000_match_livestream from './20260615_180000_match_livestream';
import * as migration_20260616_120000_user_nutrition_tracker from './20260616_120000_user_nutrition_tracker';
import * as migration_20260616_140000_news from './20260616_140000_news';
import * as migration_20260616_160000_user_checkins from './20260616_160000_user_checkins';
import * as migration_20260616_180000_match_mvp_votes from './20260616_180000_match_mvp_votes';
import * as migration_20260617_120000_processed_ops from './20260617_120000_processed_ops';
import * as migration_20260617_140000_wedstrijdeinde from './20260617_140000_wedstrijdeinde';
import * as migration_20260617_160000_club_rollen from './20260617_160000_club_rollen';
import * as migration_20260629_090000_oefeningen_sessiesjablonen from './20260629_090000_oefeningen_sessiesjablonen';
import * as migration_20260717_120000_match_score_mode from './20260717_120000_match_score_mode';
import * as migration_20260717_140000_score_mode_global from './20260717_140000_score_mode_global';
import * as migration_20260808_100000_score_trust from './20260808_100000_score_trust';
import * as migration_20260815_090000_reeks_uitbreiding_2026_2027 from './20260815_090000_reeks_uitbreiding_2026_2027';
import * as migration_20260818_090000_match_video_analyse from './20260818_090000_match_video_analyse';
import * as migration_20260818_120000_eigen_doelpunt from './20260818_120000_eigen_doelpunt';
import * as migration_20260818_140000_pass_events from './20260818_140000_pass_events';
import * as migration_20260826_090000_tornooi_groep_planning from './20260826_090000_tornooi_groep_planning';
import * as migration_20260828_110000_tornooi_velden from './20260828_110000_tornooi_velden';
import * as migration_20260828_130000_tornooi_fotos from './20260828_130000_tornooi_fotos';
import * as migration_20260828_150000_tornooi_fotos_lock_rel from './20260828_150000_tornooi_fotos_lock_rel';
import * as migration_20260828_210000_tornooi_pronostiek from './20260828_210000_tornooi_pronostiek';
import * as migration_20260830_120000_cv_events from './20260830_120000_cv_events';
import * as migration_20260830_150000_cv_events_review from './20260830_150000_cv_events_review';
import * as migration_20260831_100000_veld_maten from './20260831_100000_veld_maten'
import * as migration_20260831_110000_cv_fysiek from './20260831_110000_cv_fysiek'
import * as migration_20260831_120000_cv_analyse from './20260831_120000_cv_analyse'
import * as migration_20260901_090000_analyse_modus from './20260901_090000_analyse_modus'
import * as migration_20260901_120000_worp_bron from './20260901_120000_worp_bron'
import * as migration_20260901_140000_cv_werper from './20260901_140000_cv_werper'
import * as migration_20260901_150000_cv_werpers from './20260901_150000_cv_werpers'
import * as migration_20260901_170000_cv_uitbal from './20260901_170000_cv_uitbal'
import * as migration_20260901_200000_cv_richting from './20260901_200000_cv_richting'
import * as migration_20260902_180000_reclame_uitsnede from './20260902_180000_reclame_uitsnede'
import * as migration_20260902_224000_foto_opdracht_nr from './20260902_224000_foto_opdracht_nr'
import * as migration_20260903_200000_user_aanteken_rechten from './20260903_200000_user_aanteken_rechten'
import * as migration_20260903_210000_tweede_camera from './20260903_210000_tweede_camera'
import * as migration_20260904_120000_tornooi_score_trust from './20260904_120000_tornooi_score_trust'
import * as migration_20260904_150000_tornooi_aantekenaars from './20260904_150000_tornooi_aantekenaars'
import * as migration_20260906_140000_kantine_scherm_per_gebruiker from './20260906_140000_kantine_scherm_per_gebruiker'

import * as migration_20260913_210000_ideas from './20260913_210000_ideas'
import * as migration_20260914_221500_tornooi_u8_u10 from './20260914_221500_tornooi_u8_u10'

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
    name: '20260602_194302_tornooi',
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
  {
    up: migration_20260603_180000_club_pakket.up,
    down: migration_20260603_180000_club_pakket.down,
    name: '20260603_180000_club_pakket',
  },
  {
    up: migration_20260603_190000_match_simple_score.up,
    down: migration_20260603_190000_match_simple_score.down,
    name: '20260603_190000_match_simple_score',
  },
  {
    up: migration_20260603_200000_veld_scherm_selectie.up,
    down: migration_20260603_200000_veld_scherm_selectie.down,
    name: '20260603_200000_veld_scherm_selectie',
  },
  {
    up: migration_20260604_090000_user_official.up,
    down: migration_20260604_090000_user_official.down,
    name: '20260604_090000_user_official',
  },
  {
    up: migration_20260604_100000_audit_pdf.up,
    down: migration_20260604_100000_audit_pdf.down,
    name: '20260604_100000_audit_pdf',
  },
  {
    up: migration_20260604_120000_match_captain.up,
    down: migration_20260604_120000_match_captain.down,
    name: '20260604_120000_match_captain',
  },
  {
    up: migration_20260604_130000_user_analyse_access.up,
    down: migration_20260604_130000_user_analyse_access.down,
    name: '20260604_130000_user_analyse_access',
  },
  {
    up: migration_20260604_140000_throw_caught_by.up,
    down: migration_20260604_140000_throw_caught_by.down,
    name: '20260604_140000_throw_caught_by',
  },
  {
    up: migration_20260605_090000_match_analyse_only.up,
    down: migration_20260605_090000_match_analyse_only.down,
    name: '20260605_090000_match_analyse_only',
  },
  {
    up: migration_20260605_100000_match_coach.up,
    down: migration_20260605_100000_match_coach.down,
    name: '20260605_100000_match_coach',
  },
  {
    up: migration_20260606_072858_trainingmetingen.up,
    down: migration_20260606_072858_trainingmetingen.down,
    name: '20260606_072858_trainingmetingen',
  },
  {
    up: migration_20260606_080000_match_seizoen.up,
    down: migration_20260606_080000_match_seizoen.down,
    name: '20260606_080000_match_seizoen',
  },
  {
    up: migration_20260606_081412_trainingen.up,
    down: migration_20260606_081412_trainingen.down,
    name: '20260606_081412_trainingen'
  },
  {
    up: migration_20260606_090000_training_screenshot.up,
    down: migration_20260606_090000_training_screenshot.down,
    name: '20260606_090000_training_screenshot',
  },
  {
    up: migration_20260606_093000_training_club.up,
    down: migration_20260606_093000_training_club.down,
    name: '20260606_093000_training_club',
  },
  {
    up: migration_20260606_100000_training_reeks.up,
    down: migration_20260606_100000_training_reeks.down,
    name: '20260606_100000_training_reeks',
  },
  {
    up: migration_20260606_110000_trainingdoelen.up,
    down: migration_20260606_110000_trainingdoelen.down,
    name: '20260606_110000_trainingdoelen',
  },
  {
    up: migration_20260606_120000_user_training_access.up,
    down: migration_20260606_120000_user_training_access.down,
    name: '20260606_120000_user_training_access',
  },
  {
    up: migration_20260607_120000_match_live_tribune.up,
    down: migration_20260607_120000_match_live_tribune.down,
    name: '20260607_120000_match_live_tribune',
  },
  {
    up: migration_20260607_140000_match_finished_at.up,
    down: migration_20260607_140000_match_finished_at.down,
    name: '20260607_140000_match_finished_at',
  },
  {
    up: migration_20260607_160000_match_analyse_owner.up,
    down: migration_20260607_160000_match_analyse_owner.down,
    name: '20260607_160000_match_analyse_owner',
  },
  {
    up: migration_20260607_180000_match_takeover.up,
    down: migration_20260607_180000_match_takeover.down,
    name: '20260607_180000_match_takeover',
  },
  {
    up: migration_20260607_200000_team_speelstijl.up,
    down: migration_20260607_200000_team_speelstijl.down,
    name: '20260607_200000_team_speelstijl',
  },
  {
    up: migration_20260607_220000_club_locatie.up,
    down: migration_20260607_220000_club_locatie.down,
    name: '20260607_220000_club_locatie',
  },
  {
    up: migration_20260608_120000_user_my_teams.up,
    down: migration_20260608_120000_user_my_teams.down,
    name: '20260608_120000_user_my_teams',
  },
  {
    up: migration_20260608_140000_match_instants.up,
    down: migration_20260608_140000_match_instants.down,
    name: '20260608_140000_match_instants',
  },
  {
    up: migration_20260608_160000_player_wing.up,
    down: migration_20260608_160000_player_wing.down,
    name: '20260608_160000_player_wing',
  },
  {
    up: migration_20260608_180000_throw_tapped_by.up,
    down: migration_20260608_180000_throw_tapped_by.down,
    name: '20260608_180000_throw_tapped_by',
  },
  {
    up: migration_20260608_200000_tournament_team_clubs.up,
    down: migration_20260608_200000_tournament_team_clubs.down,
    name: '20260608_200000_tournament_team_clubs',
  },
  {
    up: migration_20260609_120000_tournament_team_link.up,
    down: migration_20260609_120000_tournament_team_link.down,
    name: '20260609_120000_tournament_team_link',
  },
  {
    up: migration_20260609_140000_player_position_enum_fix.up,
    down: migration_20260609_140000_player_position_enum_fix.down,
    name: '20260609_140000_player_position_enum_fix',
  },
  {
    up: migration_20260609_160000_player_position_text.up,
    down: migration_20260609_160000_player_position_text.down,
    name: '20260609_160000_player_position_text',
  },
  {
    up: migration_20260609_180000_player_club.up,
    down: migration_20260609_180000_player_club.down,
    name: '20260609_180000_player_club',
  },
  {
    up: migration_20260609_200000_player_position_text_v2.up,
    down: migration_20260609_200000_player_position_text_v2.down,
    name: '20260609_200000_player_position_text_v2',
  },
  {
    up: migration_20260609_220000_team_display_title_backfill.up,
    down: migration_20260609_220000_team_display_title_backfill.down,
    name: '20260609_220000_team_display_title_backfill',
  },
  {
    up: migration_20260609_240000_official_user.up,
    down: migration_20260609_240000_official_user.down,
    name: '20260609_240000_official_user',
  },
  {
    up: migration_20260609_260000_analyse_entities.up,
    down: migration_20260609_260000_analyse_entities.down,
    name: '20260609_260000_analyse_entities',
  },
  {
    up: migration_20260610_120000_user_official_backfill.up,
    down: migration_20260610_120000_user_official_backfill.down,
    name: '20260610_120000_user_official_backfill',
  },
  {
    up: migration_20260610_140000_club_display_title.up,
    down: migration_20260610_140000_club_display_title.down,
    name: '20260610_140000_club_display_title',
  },
  {
    up: migration_20260610_160000_lineup_confirmed.up,
    down: migration_20260610_160000_lineup_confirmed.down,
    name: '20260610_160000_lineup_confirmed',
  },
  {
    up: migration_20260610_180000_keuring_bevestigd.up,
    down: migration_20260610_180000_keuring_bevestigd.down,
    name: '20260610_180000_keuring_bevestigd',
  },
  {
    up: migration_20260610_200000_analyse_delen.up,
    down: migration_20260610_200000_analyse_delen.down,
    name: '20260610_200000_analyse_delen',
  },
  {
    up: migration_20260610_220000_wissel_events.up,
    down: migration_20260610_220000_wissel_events.down,
    name: '20260610_220000_wissel_events',
  },
  {
    up: migration_20260610_240000_analyse_delen_backfill.up,
    down: migration_20260610_240000_analyse_delen_backfill.down,
    name: '20260610_240000_analyse_delen_backfill',
  },
  {
    up: migration_20260611_120000_push_subscriptions.up,
    down: migration_20260611_120000_push_subscriptions.down,
    name: '20260611_120000_push_subscriptions',
  },
  {
    up: migration_20260614_120000_match_live_poll.up,
    down: migration_20260614_120000_match_live_poll.down,
    name: '20260614_120000_match_live_poll',
  },
  {
    up: migration_20260614_140000_match_score_predictions.up,
    down: migration_20260614_140000_match_score_predictions.down,
    name: '20260614_140000_match_score_predictions',
  },
  {
    up: migration_20260614_160000_club_pronostiek_pools.up,
    down: migration_20260614_160000_club_pronostiek_pools.down,
    name: '20260614_160000_club_pronostiek_pools',
  },
  {
    up: migration_20260614_180000_tournament_toon_op_live.up,
    down: migration_20260614_180000_tournament_toon_op_live.down,
    name: '20260614_180000_tournament_toon_op_live',
  },
  {
    up: migration_20260614_200000_match_pronostiek_bonus.up,
    down: migration_20260614_200000_match_pronostiek_bonus.down,
    name: '20260614_200000_match_pronostiek_bonus',
  },
  {
    up: migration_20260614_220000_user_pronostiek_power.up,
    down: migration_20260614_220000_user_pronostiek_power.down,
    name: '20260614_220000_user_pronostiek_power',
  },
  {
    up: migration_20260614_240000_user_nutrition_profile.up,
    down: migration_20260614_240000_user_nutrition_profile.down,
    name: '20260614_240000_user_nutrition_profile',
  },
  {
    up: migration_20260615_120000_user_profile.up,
    down: migration_20260615_120000_user_profile.down,
    name: '20260615_120000_user_profile',
  },
  {
    up: migration_20260615_140000_user_scorecard.up,
    down: migration_20260615_140000_user_scorecard.down,
    name: '20260615_140000_user_scorecard',
  },
  {
    up: migration_20260615_160000_advertenties.up,
    down: migration_20260615_160000_advertenties.down,
    name: '20260615_160000_advertenties',
  },
  {
    up: migration_20260615_180000_match_livestream.up,
    down: migration_20260615_180000_match_livestream.down,
    name: '20260615_180000_match_livestream',
  },
  {
    up: migration_20260616_120000_user_nutrition_tracker.up,
    down: migration_20260616_120000_user_nutrition_tracker.down,
    name: '20260616_120000_user_nutrition_tracker',
  },
  {
    up: migration_20260616_140000_news.up,
    down: migration_20260616_140000_news.down,
    name: '20260616_140000_news',
  },
  {
    up: migration_20260616_160000_user_checkins.up,
    down: migration_20260616_160000_user_checkins.down,
    name: '20260616_160000_user_checkins',
  },
  {
    up: migration_20260616_180000_match_mvp_votes.up,
    down: migration_20260616_180000_match_mvp_votes.down,
    name: '20260616_180000_match_mvp_votes',
  },
  {
    up: migration_20260617_120000_processed_ops.up,
    down: migration_20260617_120000_processed_ops.down,
    name: '20260617_120000_processed_ops',
  },
  {
    up: migration_20260617_140000_wedstrijdeinde.up,
    down: migration_20260617_140000_wedstrijdeinde.down,
    name: '20260617_140000_wedstrijdeinde',
  },
  {
    up: migration_20260617_160000_club_rollen.up,
    down: migration_20260617_160000_club_rollen.down,
    name: '20260617_160000_club_rollen',
  },
  {
    up: migration_20260629_090000_oefeningen_sessiesjablonen.up,
    down: migration_20260629_090000_oefeningen_sessiesjablonen.down,
    name: '20260629_090000_oefeningen_sessiesjablonen',
  },
  {
    up: migration_20260717_120000_match_score_mode.up,
    down: migration_20260717_120000_match_score_mode.down,
    name: '20260717_120000_match_score_mode',
  },
  {
    up: migration_20260717_140000_score_mode_global.up,
    down: migration_20260717_140000_score_mode_global.down,
    name: '20260717_140000_score_mode_global',
  },
  {
    up: migration_20260808_100000_score_trust.up,
    down: migration_20260808_100000_score_trust.down,
    name: '20260808_100000_score_trust',
  },
  {
    up: migration_20260815_090000_reeks_uitbreiding_2026_2027.up,
    down: migration_20260815_090000_reeks_uitbreiding_2026_2027.down,
    name: '20260815_090000_reeks_uitbreiding_2026_2027',
  },
  {
    up: migration_20260818_090000_match_video_analyse.up,
    down: migration_20260818_090000_match_video_analyse.down,
    name: '20260818_090000_match_video_analyse',
  },
  {
    up: migration_20260818_120000_eigen_doelpunt.up,
    down: migration_20260818_120000_eigen_doelpunt.down,
    name: '20260818_120000_eigen_doelpunt',
  },
  {
    up: migration_20260818_140000_pass_events.up,
    down: migration_20260818_140000_pass_events.down,
    name: '20260818_140000_pass_events',
  },
  {
    up: migration_20260826_090000_tornooi_groep_planning.up,
    down: migration_20260826_090000_tornooi_groep_planning.down,
    name: '20260826_090000_tornooi_groep_planning',
  },
  {
    up: migration_20260828_110000_tornooi_velden.up,
    down: migration_20260828_110000_tornooi_velden.down,
    name: '20260828_110000_tornooi_velden',
  },
  {
    up: migration_20260828_130000_tornooi_fotos.up,
    down: migration_20260828_130000_tornooi_fotos.down,
    name: '20260828_130000_tornooi_fotos',
  },
  {
    up: migration_20260828_150000_tornooi_fotos_lock_rel.up,
    down: migration_20260828_150000_tornooi_fotos_lock_rel.down,
    name: '20260828_150000_tornooi_fotos_lock_rel',
  },
  {
    up: migration_20260828_210000_tornooi_pronostiek.up,
    down: migration_20260828_210000_tornooi_pronostiek.down,
    name: '20260828_210000_tornooi_pronostiek',
  },
  {
    up: migration_20260830_120000_cv_events.up,
    down: migration_20260830_120000_cv_events.down,
    name: '20260830_120000_cv_events',
  },
  {
    up: migration_20260830_150000_cv_events_review.up,
    down: migration_20260830_150000_cv_events_review.down,
    name: '20260830_150000_cv_events_review',
  },
  {
    up: migration_20260831_100000_veld_maten.up,
    down: migration_20260831_100000_veld_maten.down,
    name: '20260831_100000_veld_maten',
  },
  {
    up: migration_20260831_110000_cv_fysiek.up,
    down: migration_20260831_110000_cv_fysiek.down,
    name: '20260831_110000_cv_fysiek',
  },
  {
    up: migration_20260831_120000_cv_analyse.up,
    down: migration_20260831_120000_cv_analyse.down,
    name: '20260831_120000_cv_analyse',
  },
  {
    up: migration_20260901_090000_analyse_modus.up,
    down: migration_20260901_090000_analyse_modus.down,
    name: '20260901_090000_analyse_modus',
  },
  {
    up: migration_20260901_120000_worp_bron.up,
    down: migration_20260901_120000_worp_bron.down,
    name: '20260901_120000_worp_bron',
  },
  {
    up: migration_20260901_140000_cv_werper.up,
    down: migration_20260901_140000_cv_werper.down,
    name: '20260901_140000_cv_werper',
  },
  {
    up: migration_20260901_150000_cv_werpers.up,
    down: migration_20260901_150000_cv_werpers.down,
    name: '20260901_150000_cv_werpers',
  },
  {
    up: migration_20260901_170000_cv_uitbal.up,
    down: migration_20260901_170000_cv_uitbal.down,
    name: '20260901_170000_cv_uitbal',
  },
  {
    up: migration_20260901_200000_cv_richting.up,
    down: migration_20260901_200000_cv_richting.down,
    name: '20260901_200000_cv_richting',
  },
  {
    up: migration_20260902_180000_reclame_uitsnede.up,
    down: migration_20260902_180000_reclame_uitsnede.down,
    name: '20260902_180000_reclame_uitsnede',
  },
  {
    up: migration_20260902_224000_foto_opdracht_nr.up,
    down: migration_20260902_224000_foto_opdracht_nr.down,
    name: '20260902_224000_foto_opdracht_nr',
  },
  {
    up: migration_20260903_200000_user_aanteken_rechten.up,
    down: migration_20260903_200000_user_aanteken_rechten.down,
    name: '20260903_200000_user_aanteken_rechten',
  },
  {
    up: migration_20260903_210000_tweede_camera.up,
    down: migration_20260903_210000_tweede_camera.down,
    name: '20260903_210000_tweede_camera',
  },
  {
    up: migration_20260904_120000_tornooi_score_trust.up,
    down: migration_20260904_120000_tornooi_score_trust.down,
    name: '20260904_120000_tornooi_score_trust',
  },
  {
    up: migration_20260904_150000_tornooi_aantekenaars.up,
    down: migration_20260904_150000_tornooi_aantekenaars.down,
    name: '20260904_150000_tornooi_aantekenaars',
  },
  {
    up: migration_20260906_140000_kantine_scherm_per_gebruiker.up,
    down: migration_20260906_140000_kantine_scherm_per_gebruiker.down,
    name: '20260906_140000_kantine_scherm_per_gebruiker',
  },
  {
    up: migration_20260913_210000_ideas.up,
    down: migration_20260913_210000_ideas.down,
    name: '20260913_210000_ideas',
  },
  {
    up: migration_20260914_221500_tornooi_u8_u10.up,
    down: migration_20260914_221500_tornooi_u8_u10.down,
    name: '20260914_221500_tornooi_u8_u10',
  },
];
