from datetime import datetime, timedelta, timezone as dt_timezone
import logging
import os
import random
import re
import string
import threading
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.utils.dateparse import parse_datetime
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from django.core import signing
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from .football_data import (
    canonical_team_name,
    fetch_api_football_fixture_player_stats_for_match,
    fetch_api_football_fixture_stats_for_match,
    fetch_api_football_player_stats,
    fetch_match,
    fetch_pl_matches,
    fetch_pl_result_stats,
    fetch_pl_scorers,
    fetch_pl_teams,
    fetch_team_players,
    fetch_thesportsdb_event_stats,
)
from .email_templates import fantasy_notification_email
from .models import AdminMatch, AdminProfile, TransferRecord, UserTeam, Player
from .serializers import EmailTokenObtainPairSerializer, RegisterSerializer

User = get_user_model()
logger = logging.getLogger(__name__)

BASE_BUDGET = Decimal('50000000.00')
MAX_OWNED_PLAYERS = 15
MAX_WATCHLIST_PLAYERS = 2

REWARD_BY_RANK = {
    1: Decimal('15000000.00'),
    2: Decimal('10000000.00'),
    3: Decimal('7000000.00'),
    4: Decimal('5000000.00'),
    5: Decimal('3000000.00'),
}
DEFAULT_REWARD = Decimal('2000000.00')
PROFILE_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
PROFILE_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024


def _profile_picture_url(user, request=None):
    picture = getattr(user, 'profile_picture', '') or ''
    if not picture:
        return ''
    if picture.startswith(('http://', 'https://')):
        return picture
    if request:
        return request.build_absolute_uri(picture)
    return picture


def _user_payload(user, request=None):
    return {
        'id': str(user.pk),
        'username': user.username,
        'email': user.email,
        'role': 'admin' if user.is_staff else 'user',
        'is_staff': user.is_staff,
        'profile_picture': _profile_picture_url(user, request),
    }


def _admin_user_payload(user):
    return {
        'id': str(user.pk),
        'email': user.email,
        'username': user.username,
        'role': 'admin' if user.is_staff else 'user',
        'is_staff': user.is_staff,
        'is_active': user.is_active,
        'date_joined': user.date_joined.isoformat() if user.date_joined else None,
    }


def _player_payload(player):
    ban_starts_at = getattr(player, 'ban_starts_at', None)
    ban_expires_at = getattr(player, 'ban_expires_at', None)
    now = timezone.now()
    is_banned = bool(ban_expires_at and ban_expires_at > now and (ban_starts_at is None or ban_starts_at <= now))
    return {
        'id': player.player_api_id,
        'name': player.name,
        'position': _normalize_position_label(player.position),
        'team': player.team_name,
        'team_api_id': player.team_api_id,
        'nationality': player.nationality,
        'date_of_birth': player.date_of_birth.isoformat() if player.date_of_birth else None,
        'value': float(player.cost),
        'is_banned': is_banned,
        'ban_starts_at': ban_starts_at.isoformat() if ban_starts_at else None,
        'ban_expires_at': ban_expires_at.isoformat() if ban_expires_at else None,
        'ban_reason': getattr(player, 'ban_reason', '') or '',
    }


def _parse_optional_datetime(value):
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _first_non_empty(*values):
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text and text not in {'-', '--', 'N/A', 'n/a', 'Unknown', 'unknown'}:
            return value
    return None


def _normalize_position_label(position):
    value = str(position or '').lower()
    if not value or value in {'unknown', 'n/a', '-', '--'}:
        return ''
    if any(token in value for token in ('goalkeeper', 'keeper', 'goalie')):
        return 'Goalkeeper'
    if any(token in value for token in ('defence', 'defender', 'centre-back', 'center-back', 'full-back', 'wing-back', 'back')):
        return 'Defence'
    if any(token in value for token in ('midfield', 'midfielder', 'central midfield', 'attacking midfield', 'defensive midfield')):
        return 'Midfield'
    if any(token in value for token in ('offence', 'offense', 'forward', 'striker', 'winger', 'centre-forward', 'center-forward', 'attack')):
        return 'Offence'
    return str(position or '').strip()


def _apply_player_ban_fields(player, data):
    if data.get('clear_ban'):
        player.ban_starts_at = None
        player.ban_expires_at = None
        player.ban_reason = ''
        return

    if 'ban_reason' in data:
        player.ban_reason = data.get('ban_reason') or ''

    if 'ban_starts_at' in data:
        player.ban_starts_at = _parse_optional_datetime(data.get('ban_starts_at'))

    if 'ban_expires_at' in data:
        expires_at = _parse_optional_datetime(data.get('ban_expires_at'))
        if data.get('ban_expires_at') and expires_at is None:
            raise ValueError('Invalid ban expiry date.')
        player.ban_expires_at = expires_at

    if 'ban_duration_weeks' in data and data.get('ban_duration_weeks') not in (None, ''):
        weeks = int(data.get('ban_duration_weeks'))
        if weeks < 1:
            raise ValueError('Ban duration must be at least one week.')
        start_at = player.ban_starts_at or timezone.now()
        player.ban_starts_at = start_at
        player.ban_expires_at = start_at + timedelta(weeks=weeks)

    if player.ban_starts_at and player.ban_expires_at and player.ban_expires_at <= player.ban_starts_at:
        raise ValueError('Ban expiry must be after the ban start time.')


def _clean_players(players):
    return [player for player in (players or []) if isinstance(player, dict) and player.get('id') is not None]


def _owned_player_ids(players):
    return {str(player.get('id')) for player in _clean_players(players)}


def _reward_for_rank(rank):
    return REWARD_BY_RANK.get(rank, DEFAULT_REWARD)


def _ensure_team_defaults(team):
    has_owned_players = bool(_clean_players(team.players))
    has_transfers = TransferRecord.objects.filter(user=team.user).exists()
    if not has_owned_players and not has_transfers and team.budget != BASE_BUDGET:
        team.budget = BASE_BUDGET
        team.save(update_fields=['budget'])
    return team


def _normalize_player_from_db(player_obj, existing=None):
    existing = existing or {}
    return {
        'id': player_obj.player_api_id,
        'name': player_obj.name,
        'position': _normalize_position_label(player_obj.position),
        'team': player_obj.team_name,
        'team_api_id': player_obj.team_api_id,
        'value': float(player_obj.cost),
        'added_at': existing.get('added_at') or timezone.now().isoformat(),
    }


def _is_player_banned(player_obj):
    if not player_obj:
        return False
    return bool(_player_payload(player_obj).get('is_banned'))


def _lineup_for_points(team):
    selected = _clean_players(getattr(team, 'selected_players', None))
    players = selected or _clean_players(team.players)
    available_players = []
    for player in players:
        player_obj = Player.objects.filter(player_api_id=player.get('id')).first()
        if not _is_player_banned(player_obj):
            available_players.append(player)
    return available_players


def _coerce_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = parse_datetime(str(value))
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, dt_timezone.utc)
    return dt


def _match_kickoff(match):
    return _coerce_datetime(match.get('utcDate') or match.get('kickoff'))


def _match_sort_kickoff(match):
    return _match_kickoff(match) or datetime.min.replace(tzinfo=dt_timezone.utc)


def _ownership_intervals_for_team(team):
    intervals = {}
    open_intervals = {}
    events = []

    for player in _clean_players(team.players):
        player_name = player.get('name')
        started_at = _coerce_datetime(player.get('added_at')) or _coerce_datetime(team.user.date_joined)
        if player_name and started_at:
            events.append((started_at, 'buy', player_name))

    for record in TransferRecord.objects.filter(user=team.user).order_by('created_at', 'id'):
        if record.player_out and record.player_out != '(bought)':
            events.append((record.created_at, 'sell', record.player_out))
        if record.player_in and record.player_in != '(sold)':
            events.append((record.created_at, 'buy', record.player_in))

    events.sort(key=lambda item: item[0])

    for event_time, event_type, player_name in events:
        if not player_name:
            continue
        if event_type == 'buy':
            open_intervals.setdefault(player_name, event_time)
            continue

        started_at = open_intervals.pop(player_name, None)
        if started_at:
            intervals.setdefault(player_name, []).append((started_at, event_time))

    for player_name, started_at in open_intervals.items():
        intervals.setdefault(player_name, []).append((started_at, None))

    return intervals


def _player_owned_at_kickoff(team, player_name, kickoff, ownership_intervals=None):
    if not player_name or kickoff is None:
        return False

    ownership_intervals = ownership_intervals or _ownership_intervals_for_team(team)
    for started_at, ended_at in ownership_intervals.get(player_name, []):
        if started_at and kickoff < started_at:
            continue
        if ended_at and kickoff >= ended_at:
            continue
        return True
    return False


def _match_has_eligible_points(
    team,
    match,
    *,
    ownership_intervals=None,
    registration_at=None,
    require_ownership=True,
    require_registration=True,
):
    if match.get('status') != 'FINISHED':
        return False

    kickoff = _match_kickoff(match)
    if require_registration and registration_at and kickoff and kickoff < registration_at:
        return False

    players = _lineup_for_points(team)
    ownership_intervals = ownership_intervals or _ownership_intervals_for_team(team)

    for player in players:
        if not isinstance(player, dict) or player.get('id') is None:
            continue
        player_obj = Player.objects.filter(player_api_id=player.get('id')).first()
        player_name = player_obj.name if player_obj else player.get('name')
        if require_ownership and not _player_owned_at_kickoff(team, player_name, kickoff, ownership_intervals):
            continue

        team_api_id = player_obj.team_api_id if player_obj else player.get('team_api_id')
        if not team_api_id:
            continue

        if _result_for_team(match, team_api_id) is not None:
            return True

    return False


def _reconcile_team_points(team, finished_matches=None):
    finished_matches = finished_matches or fetch_pl_matches(limit=500, status='FINISHED')
    if not finished_matches:
        logger.warning("Skipping point reconciliation for user %s because finished match data is unavailable.", team.user_id)
        return int(team.points or 0)

    match_index = {
        str(match.get('id')): match
        for match in finished_matches
        if match.get('id')
    }
    ownership_intervals = _ownership_intervals_for_team(team)
    registration_at = _coerce_datetime(team.user.date_joined)

    recomputed_points = 0
    weekly_points = {}
    processed_weeks = set()
    seen_keys = set()

    for record in list(team.processed_match_results or []):
        if not isinstance(record, dict):
            continue
        key = _record_key(record)
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)

        match = match_index.get(str(record.get('match_id')))
        if not match or match.get('status') != 'FINISHED':
            continue

        kickoff = _match_kickoff(match)
        if registration_at and kickoff and kickoff < registration_at:
            continue

        player_id = record.get('player_id')
        player_obj = Player.objects.filter(player_api_id=player_id).first() if player_id is not None else None
        player_name = record.get('player_name') or (player_obj.name if player_obj else None)
        if not _player_owned_at_kickoff(team, player_name, kickoff, ownership_intervals):
            continue

        team_api_id = record.get('team_api_id') or (player_obj.team_api_id if player_obj else None)
        if not team_api_id:
            continue

        result = _result_for_team(match, team_api_id)
        if result is None:
            continue

        points = int(result['points'])
        week_key = str(record.get('matchweek') or match.get('matchday'))
        weekly_points[week_key] = int(weekly_points.get(week_key, 0)) + points
        recomputed_points += points
        if week_key.isdigit():
            processed_weeks.add(int(week_key))

    team.points = int(recomputed_points)
    team.weekly_points = weekly_points
    team.processed_matchweeks = sorted(processed_weeks)
    team.last_synced_at = timezone.now()
    team.save(update_fields=['points', 'weekly_points', 'processed_matchweeks', 'last_synced_at'])
    return recomputed_points


def _squad_payload(*, squad_id, name, selected_players=None, formation='4-4-2', layout=None):
    selected_players = selected_players or []
    return {
        'id': str(squad_id),
        'name': (name or 'Main Squad').strip()[:80],
        'selected_players': selected_players,
        'formation': formation or '4-4-2',
        'layout': layout or {'formation': formation or '4-4-2'},
    }


def _ensure_squads(team):
    squads = list(team.squads or [])
    if not squads:
        active_id = team.active_squad_id or 'default'
        squads = [
            _squad_payload(
                squad_id=active_id,
                name='Main Squad',
                selected_players=team.selected_players or [],
                formation=team.formation,
            )
        ]
        team.squads = squads
        team.active_squad_id = active_id
        team.save(update_fields=['squads', 'active_squad_id'])
        return squads

    active_id = team.active_squad_id or squads[0].get('id') or 'default'
    if not any(str(squad.get('id')) == str(active_id) for squad in squads):
        active_id = squads[0].get('id') or 'default'
        team.active_squad_id = active_id
        team.save(update_fields=['active_squad_id'])
    return squads


def _active_squad(team):
    squads = _ensure_squads(team)
    active_id = team.active_squad_id or squads[0].get('id')
    return next((squad for squad in squads if str(squad.get('id')) == str(active_id)), squads[0])


def _sync_team_from_squad(team, squad):
    team.active_squad_id = str(squad.get('id') or team.active_squad_id or 'default')
    team.selected_players = squad.get('selected_players') or []
    team.formation = squad.get('formation') or '4-4-2'


def _validate_selected_players(players, owned_players):
    owned_ids = _owned_player_ids(owned_players)
    selected_players = []
    seen_ids = set()

    for player in players or []:
        if not isinstance(player, dict):
            selected_players.append(None)
            continue
        player_id = player.get('id')
        if player_id is None:
            selected_players.append(None)
            continue
        if str(player_id) not in owned_ids:
            return None, 'Team selection can only include players you have already bought.'
        if str(player_id) in seen_ids:
            return None, 'This player is already selected in your team.'
        seen_ids.add(str(player_id))

        player_obj = Player.objects.filter(player_api_id=player_id).first()
        if player_obj:
            if _is_player_banned(player_obj):
                return None, f'{player_obj.name} is currently banned and unavailable for selection.'
            existing_player = next((owned for owned in owned_players if str(owned.get('id')) == str(player_id)), None)
            selected_players.append(_normalize_player_from_db(player_obj, existing_player))
        else:
            existing_player = next((owned for owned in owned_players if str(owned.get('id')) == str(player_id)), player)
            selected_players.append(existing_player)

    if len(_clean_players(selected_players)) > MAX_OWNED_PLAYERS:
        return None, 'A selected team cannot contain more than 15 players.'

    return selected_players, None


def update_rankings_and_rewards(matchweek=None):
    all_teams = list(UserTeam.objects.select_related('user').filter(user__is_staff=False).order_by('-points'))
    for i, team in enumerate(all_teams):
        new_rank = str(i + 1)
        if team.rank != new_rank:
            team.rank = new_rank
            team.save(update_fields=['rank'])

    if matchweek is None:
        matchweeks = []
        for team in all_teams:
            matchweeks.extend(int(key) for key in (team.weekly_points or {}).keys() if str(key).isdigit())
        matchweek = max(matchweeks) if matchweeks else None

    if matchweek is None:
        return

    week_key = str(matchweek)
    eligible_teams = [team for team in all_teams if week_key in (team.weekly_points or {})]
    weekly_rows = sorted(
        eligible_teams,
        key=lambda team: int((team.weekly_points or {}).get(week_key, 0)),
        reverse=True,
    )

    for i, team in enumerate(weekly_rows):
        reward_key = f"mw:{week_key}"
        existing_rewards = list(team.rewards or [])
        if any(item.get('key') == reward_key for item in existing_rewards):
            continue

        reward = _reward_for_rank(i + 1)
        team.budget = Decimal(team.budget) + reward
        existing_rewards.append({
            'key': reward_key,
            'matchweek': matchweek,
            'rank': i + 1,
            'weekly_points': int((team.weekly_points or {}).get(week_key, 0)),
            'reward': float(reward),
            'awarded_at': timezone.now().isoformat(),
        })
        team.rewards = existing_rewards
        team.save(update_fields=['budget', 'rewards'])


def _match_payload(match):
    full_time = (match.get('score') or {}).get('fullTime') or {}
    half_time = (match.get('score') or {}).get('halfTime') or {}
    score = match.get('score') or {}
    competition = match.get('competition') or {}
    season = match.get('season') or {}
    status_value = match.get('status')
    full_time_score = (
        f"{full_time.get('home')} - {full_time.get('away')}"
        if full_time.get('home') is not None and full_time.get('away') is not None
        else None
    )
    half_time_score = (
        f"{half_time.get('home')} - {half_time.get('away')}"
        if half_time.get('home') is not None and half_time.get('away') is not None
        else None
    )
    return {
        'id': match.get('id'),
        'matchday': match.get('matchday'),
        'competition': competition.get('name') or competition.get('code'),
        'season_start': season.get('startDate'),
        'season_end': season.get('endDate'),
        'stage': match.get('stage'),
        'group': match.get('group'),
        'home_team': match.get('homeTeam', {}).get('shortName') or match.get('homeTeam', {}).get('name'),
        'away_team': match.get('awayTeam', {}).get('shortName') or match.get('awayTeam', {}).get('name'),
        'home_team_id': match.get('homeTeam', {}).get('id'),
        'away_team_id': match.get('awayTeam', {}).get('id'),
        'status': status_value,
        'kickoff': match.get('utcDate'),
        'last_updated': match.get('lastUpdated'),
        'winner': score.get('winner'),
        'score': full_time_score if status_value == 'FINISHED' else None,
        'full_time_score': full_time_score,
        'half_time_score': half_time_score,
        'duration': score.get('duration'),
        'referees': [
            referee.get('name')
            for referee in (match.get('referees') or [])
            if referee.get('name')
        ],
        'events': _match_events(match),
        'stats': _extract_match_stats(match),
    }


def _admin_match_payload(match):
    score = None
    if match.home_score is not None and match.away_score is not None:
        score = f"{match.home_score} - {match.away_score}"
    return {
        'id': str(match.pk),
        'matchday': match.matchday,
        'home_team': match.home_team,
        'away_team': match.away_team,
        'status': match.status,
        'kickoff': match.kickoff.isoformat() if match.kickoff else None,
        'score': score,
        'home_score': match.home_score,
        'away_score': match.away_score,
        'source': 'admin',
    }


def _optional_int(value):
    if value in ('', None):
        return None
    return int(value)


def _difficulty_for_match(match):
    home_id = match.get('homeTeam', {}).get('id') or 0
    away_id = match.get('awayTeam', {}).get('id') or 0
    seed = ((int(home_id) * 7) + (int(away_id) * 11) + int(match.get('matchday') or 0)) % 100
    rating = 1 + (seed % 5)
    return {
        **_match_payload(match),
        'difficulty': rating,
        'difficulty_label': ['Very Easy', 'Easy', 'Moderate', 'Hard', 'Very Hard'][rating - 1],
    }


def _is_attacker_position(position):
    value = (position or '').lower()
    return any(token in value for token in ('offence', 'forward', 'attacker', 'striker', 'winger'))


def _safe_number(value):
    if value in ('', None):
        return None
    try:
        return float(str(value).replace('%', '').strip())
    except (TypeError, ValueError):
        return None


def _safe_int(value):
    number = _safe_number(value)
    return int(number) if number is not None else None


def _nested_value(item, *path):
    current = item
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _first_safe_number(item, *paths):
    if not isinstance(item, dict):
        return None
    for path in paths:
        raw_value = _nested_value(item, *path) if isinstance(path, tuple) else item.get(path)
        number = _safe_number(raw_value)
        if number is not None:
            return number
    return None


def _normalize_stat_name(name):
    return ''.join(ch for ch in str(name or '').lower() if ch.isalnum())


STAT_ALIASES = {
    'goals': {'goals', 'fulltimegoals'},
    'half_time_goals': {'halftimegoals'},
    'shots': {'totalshots', 'shots', 'shotstotal'},
    'shots_on_target': {'shotsontarget', 'shotsongoal', 'ontarget', 'shotson'},
    'shots_off_target': {'shotsofftarget', 'shotsoffgoal'},
    'possession': {'possession', 'ballpossession'},
    'pass_accuracy': {
        'passaccuracy',
        'passesaccuracy',
        'accuratepassespercentage',
        'passingaccuracy',
        'passcompletion',
        'passcompletionrate',
        'passsuccess',
        'passsuccessrate',
        'passespercentage',
        'passespercent',
        'passpercentage',
        'accuratepasspercentage',
    },
    'passes': {'passes', 'totalpasses', 'passestotal', 'passesattempted', 'passattempts'},
    'fouls': {'fouls', 'foulscommitted'},
    'yellow_cards': {'yellowcards', 'yellowcard'},
    'yellow_red_cards': {'yellowredcards', 'secondyellowcards'},
    'red_cards': {'redcards', 'redcard'},
    'offsides': {'offsides', 'offside'},
    'corners': {'corners', 'cornerkicks'},
    'free_kicks': {'freekicks'},
    'goal_kicks': {'goalkicks'},
    'throw_ins': {'throwins'},
    'saves': {'saves', 'goalkeepersaves', 'keepersaves'},
    'xg': {'xg', 'expectedgoals'},
    'big_chances': {'bigchances', 'bigchancescreated'},
}


def _empty_team_stats():
    return {key: None for key in STAT_ALIASES.keys()}


def _parse_stat_ratio(raw_value):
    text = str(raw_value or '').strip()
    match = re.match(r'^(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$', text)
    if not match:
        return None
    try:
        left = float(match.group(1))
        right = float(match.group(2))
        return left, right
    except (TypeError, ValueError):
        return None


def _coerce_stat_value(stat_key, raw_value):
    ratio = _parse_stat_ratio(raw_value)
    if ratio:
        left, right = ratio
        if stat_key == 'pass_accuracy':
            return round((left / right) * 100, 1) if right else None
        if stat_key == 'passes':
            return right if right else left
        return left
    return _safe_number(raw_value)


def _set_stat(stats, side, raw_name, raw_value):
    normalized = _normalize_stat_name(raw_name)
    for key, aliases in STAT_ALIASES.items():
        if normalized in aliases:
            stats[side][key] = _coerce_stat_value(key, raw_value)
            return


def _first_present(item, *keys):
    for key in keys:
        if key in item and item.get(key) is not None:
            return item.get(key)
    return None


def _extract_match_stats(match):
    stats = {'home': _empty_team_stats(), 'away': _empty_team_stats(), 'available': False}

    def _ingest_team_stat_block(side, block):
        if isinstance(block, dict):
            for key, value in block.items():
                _set_stat(stats, side, key, value)
            return

        if not isinstance(block, list):
            return

        for item in block:
            if not isinstance(item, dict):
                continue
            raw_name = item.get('type') or item.get('name') or item.get('label') or item.get('key')
            raw_value = _first_present(item, 'value', 'stat', 'amount', 'count')
            _set_stat(stats, side, raw_name, raw_value)

    home_stats = (
        match.get('homeStatistics')
        or match.get('home_stats')
        or (match.get('homeTeam') or {}).get('statistics')
        or {}
    )
    away_stats = (
        match.get('awayStatistics')
        or match.get('away_stats')
        or (match.get('awayTeam') or {}).get('statistics')
        or {}
    )
    _ingest_team_stat_block('home', home_stats)
    _ingest_team_stat_block('away', away_stats)

    raw_statistics = match.get('statistics') or match.get('stats') or []
    if isinstance(raw_statistics, dict):
        for key, value in raw_statistics.items():
            if isinstance(value, dict):
                _set_stat(stats, 'home', key, value.get('home'))
                _set_stat(stats, 'away', key, value.get('away'))
    elif isinstance(raw_statistics, list):
        for item in raw_statistics:
            if not isinstance(item, dict):
                continue
            raw_name = item.get('type') or item.get('name') or item.get('stat') or item.get('key')
            home_value = _first_present(item, 'home', 'homeValue', 'home_team')
            away_value = _first_present(item, 'away', 'awayValue', 'away_team')
            if home_value is not None or away_value is not None:
                _set_stat(stats, 'home', raw_name, home_value)
                _set_stat(stats, 'away', raw_name, away_value)

            team_side = str(item.get('team') or item.get('side') or '').lower()
            value = item.get('value')
            if value is not None and team_side in ('home', 'away'):
                _set_stat(stats, team_side, raw_name, value)

    stats['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in stats[side].values()
    )
    stats['unavailable_fields'] = [
        key
        for key in ('pass_accuracy', 'passes', 'xg', 'big_chances')
        if stats['home'].get(key) is None and stats['away'].get(key) is None
    ]
    stats['message'] = (
        'Detailed provider statistics loaded for this match.'
        if stats['available']
        else 'The provider has not published advanced statistics for this fixture yet.'
    )
    if match.get('source'):
        stats['source'] = match.get('source')
    return stats


def _parse_result_date(value):
    for fmt in ('%d/%m/%Y', '%d/%m/%y'):
        try:
            return datetime.strptime(str(value), fmt).date()
        except (TypeError, ValueError):
            continue
    return None


def _match_result_stats_row(match, rows):
    home_name = canonical_team_name((match.get('homeTeam') or {}).get('shortName') or (match.get('homeTeam') or {}).get('name'))
    away_name = canonical_team_name((match.get('awayTeam') or {}).get('shortName') or (match.get('awayTeam') or {}).get('name'))
    kickoff = _match_kickoff(match)
    match_date = kickoff.date() if kickoff else None
    score = (match.get('score') or {}).get('fullTime') or {}
    home_goals = score.get('home')
    away_goals = score.get('away')

    best_candidate = None
    best_distance = 99
    for row in rows:
        row_home = canonical_team_name(row.get('HomeTeam'))
        row_away = canonical_team_name(row.get('AwayTeam'))
        if row_home != home_name or row_away != away_name:
            continue

        if home_goals is not None and _safe_int(row.get('FTHG')) != int(home_goals):
            continue
        if away_goals is not None and _safe_int(row.get('FTAG')) != int(away_goals):
            continue

        row_date = _parse_result_date(row.get('Date'))
        if match_date and row_date:
            distance = abs((row_date - match_date).days)
            if distance > 3:
                continue
        else:
            distance = 0

        if distance < best_distance:
            best_candidate = row
            best_distance = distance

    return best_candidate


def _stats_from_result_row(row):
    stats = {'home': _empty_team_stats(), 'away': _empty_team_stats(), 'available': False}
    mapping = {
        'shots': ('HS', 'AS'),
        'shots_on_target': ('HST', 'AST'),
        'fouls': ('HF', 'AF'),
        'corners': ('HC', 'AC'),
        'yellow_cards': ('HY', 'AY'),
        'red_cards': ('HR', 'AR'),
    }
    for key, (home_col, away_col) in mapping.items():
        stats['home'][key] = _safe_number(row.get(home_col))
        stats['away'][key] = _safe_number(row.get(away_col))

    for side in ('home', 'away'):
        shots = stats[side].get('shots')
        shots_on_target = stats[side].get('shots_on_target')
        if shots is not None and shots_on_target is not None:
            stats[side]['shots_off_target'] = max(0, shots - shots_on_target)

    stats['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in stats[side].values()
    )
    stats['source'] = 'football-data.co.uk'
    stats['message'] = 'Match statistics loaded from football-data.co.uk results data.'
    stats['unavailable_fields'] = [
        key
        for key in ('possession', 'pass_accuracy', 'passes', 'offsides', 'saves', 'xg', 'big_chances')
        if stats['home'].get(key) is None and stats['away'].get(key) is None
    ]
    return stats


def _team_form_rows(rows, team_name, before_date=None, limit=8):
    canonical = canonical_team_name(team_name)
    matches = []
    for row in rows:
        row_date = _parse_result_date(row.get('Date'))
        if before_date and row_date and row_date > before_date:
            continue
        if canonical_team_name(row.get('HomeTeam')) == canonical:
            matches.append((row_date, row, 'home'))
        elif canonical_team_name(row.get('AwayTeam')) == canonical:
            matches.append((row_date, row, 'away'))

    matches.sort(key=lambda item: item[0] or datetime.min.date(), reverse=True)
    return matches[:limit]


def _average(values):
    cleaned = [value for value in values if value is not None]
    if not cleaned:
        return None
    return round(sum(cleaned) / len(cleaned), 1)


def _team_form_metrics(team_rows):
    values = {
        'goals': [],
        'shots': [],
        'shots_on_target': [],
        'fouls': [],
        'corners': [],
        'yellow_cards': [],
        'red_cards': [],
    }
    for _, row, side in team_rows:
        home = side == 'home'
        values['goals'].append(_safe_number(row.get('FTHG' if home else 'FTAG')))
        values['shots'].append(_safe_number(row.get('HS' if home else 'AS')))
        values['shots_on_target'].append(_safe_number(row.get('HST' if home else 'AST')))
        values['fouls'].append(_safe_number(row.get('HF' if home else 'AF')))
        values['corners'].append(_safe_number(row.get('HC' if home else 'AC')))
        values['yellow_cards'].append(_safe_number(row.get('HY' if home else 'AY')))
        values['red_cards'].append(_safe_number(row.get('HR' if home else 'AR')))

    metrics = {key: _average(metric_values) for key, metric_values in values.items()}
    shots = metrics.get('shots')
    shots_on_target = metrics.get('shots_on_target')
    if shots is not None and shots_on_target is not None:
        metrics['shots_off_target'] = round(max(0, shots - shots_on_target), 1)
    return metrics


def _team_form_stats_from_rows(match, rows):
    home = match.get('homeTeam') or {}
    away = match.get('awayTeam') or {}
    kickoff = _match_kickoff(match)
    before_date = kickoff.date() if kickoff else None
    home_rows = _team_form_rows(rows, home.get('name') or home.get('shortName'), before_date=before_date)
    away_rows = _team_form_rows(rows, away.get('name') or away.get('shortName'), before_date=before_date)

    stats = {'home': _empty_team_stats(), 'away': _empty_team_stats(), 'available': False}
    stats['home'].update(_team_form_metrics(home_rows))
    stats['away'].update(_team_form_metrics(away_rows))
    stats['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in stats[side].values()
    )
    stats['source'] = 'team-form-history'
    stats['message'] = 'Showing recent team-form averages from historical Premier League match data.'
    stats['sample_size'] = {
        'home': len(home_rows),
        'away': len(away_rows),
    }
    stats['unavailable_fields'] = [
        key
        for key in STAT_ALIASES.keys()
        if stats['home'].get(key) is None and stats['away'].get(key) is None
    ]
    return stats


def _stats_from_thesportsdb(data):
    stats = {'home': _empty_team_stats(), 'away': _empty_team_stats(), 'available': False}
    rows = data.get('eventstats') or data.get('stats') or data.get('event_stats') or []
    if isinstance(rows, dict):
        rows = [rows]

    for row in rows or []:
        if not isinstance(row, dict):
            continue
        label = (
            row.get('strStat')
            or row.get('strStatistic')
            or row.get('stat')
            or row.get('name')
            or row.get('type')
        )
        home_value = _first_present(row, 'intHome', 'home', 'homeValue', 'strHome')
        away_value = _first_present(row, 'intAway', 'away', 'awayValue', 'strAway')
        _set_stat(stats, 'home', label, home_value)
        _set_stat(stats, 'away', label, away_value)

    stats['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in stats[side].values()
    )
    stats['source'] = 'TheSportsDB'
    stats['message'] = 'Match statistics loaded from TheSportsDB.'
    stats['unavailable_fields'] = [
        key
        for key in STAT_ALIASES.keys()
        if stats['home'].get(key) is None and stats['away'].get(key) is None
    ]
    return stats


def _stats_from_api_football(data, match):
    stats = {'home': _empty_team_stats(), 'away': _empty_team_stats(), 'available': False}
    rows = data.get('response') or []
    if isinstance(rows, dict):
        rows = [rows]

    home_team_id = (match.get('homeTeam') or {}).get('id')
    away_team_id = (match.get('awayTeam') or {}).get('id')
    home_team_name = canonical_team_name((match.get('homeTeam') or {}).get('name') or (match.get('homeTeam') or {}).get('shortName'))
    away_team_name = canonical_team_name((match.get('awayTeam') or {}).get('name') or (match.get('awayTeam') or {}).get('shortName'))
    accurate_passes = {'home': None, 'away': None}

    def _team_name_matches(left, right):
        if not left or not right:
            return False
        if left == right:
            return True
        return left in right or right in left

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue

        team = row.get('team') or {}
        team_id = team.get('id')
        team_name = canonical_team_name(team.get('name'))
        if home_team_id is not None and team_id == home_team_id:
            side = 'home'
        elif away_team_id is not None and team_id == away_team_id:
            side = 'away'
        elif _team_name_matches(team_name, home_team_name):
            side = 'home'
        elif _team_name_matches(team_name, away_team_name):
            side = 'away'
        elif index == 0:
            side = 'home'
        elif index == 1:
            side = 'away'
        else:
            continue

        for item in row.get('statistics') or []:
            if not isinstance(item, dict):
                continue
            stat_type = str(item.get('type') or '').strip()
            normalized_type = _normalize_stat_name(stat_type)
            raw_value = item.get('value')

            if normalized_type in {'totalshots', 'shots'}:
                _set_stat(stats, side, 'shots', raw_value)
                continue

            if normalized_type in {'shotsongoal', 'shotsontarget'}:
                _set_stat(stats, side, 'shots_on_target', raw_value)
                continue

            if normalized_type in {'ballpossession', 'possession'}:
                _set_stat(stats, side, 'possession', raw_value)
                continue

            if normalized_type in {'totalpasses', 'passesattempted', 'passattempts', 'totalpass', 'passescompleted', 'passcompleted', 'completedpasses'}:
                _set_stat(stats, side, 'passes', raw_value)
                continue

            if 'pass' in normalized_type and ('%' in stat_type or 'accuracy' in normalized_type or 'percentage' in normalized_type):
                _set_stat(stats, side, 'pass_accuracy', raw_value)
                continue

            if normalized_type in {'passesaccurate', 'accuratepasses', 'accuratepass', 'accuratepassescount', 'accuratecompletedpasses'}:
                accurate_passes[side] = _safe_number(raw_value)
                continue

            if normalized_type in {'passesaccuracy', 'passaccuracy', 'passingaccuracy', 'passcompletion', 'passcompletionrate', 'passsuccessrate', 'passespercentage', 'passespercent', 'passpercentage'}:
                _set_stat(stats, side, 'pass_accuracy', raw_value)

            if normalized_type == 'passes' and '%' in stat_type:
                _set_stat(stats, side, 'pass_accuracy', raw_value)
                continue
            if normalized_type == 'passes':
                _set_stat(stats, side, 'passes', raw_value)

    for side in ('home', 'away'):
        total_passes = stats[side].get('passes')
        accurate = accurate_passes.get(side)
        if stats[side].get('pass_accuracy') is None and accurate is not None and total_passes:
            stats[side]['pass_accuracy'] = round((accurate / total_passes) * 100, 1)

    stats['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in stats[side].values()
    )
    stats['source'] = 'API-FOOTBALL'
    stats['message'] = 'Match statistics loaded from API-FOOTBALL.'
    stats['unavailable_fields'] = [
        key
        for key in STAT_ALIASES.keys()
        if stats['home'].get(key) is None and stats['away'].get(key) is None
    ]
    logger.info(
        "API-FOOTBALL stats parsed fixture=%s raw_types=%s home=%s away=%s",
        match.get('id'),
        sorted({
            str(item.get('type') or item.get('name') or item.get('label') or item.get('key') or '')
            for row in rows if isinstance(row, dict)
            for item in (row.get('statistics') or []) if isinstance(item, dict)
        })[:25],
        {key: stats['home'].get(key) for key in ('possession', 'passes', 'pass_accuracy', 'shots', 'shots_on_target')},
        {key: stats['away'].get(key) for key in ('possession', 'passes', 'pass_accuracy', 'shots', 'shots_on_target')},
    )
    logger.info(
        "Mapped API-FOOTBALL stats fixture=%s home_possession=%s away_possession=%s home_passes=%s away_passes=%s home_pass_accuracy=%s away_pass_accuracy=%s",
        match.get('id'),
        stats['home'].get('possession'),
        stats['away'].get('possession'),
        stats['home'].get('passes'),
        stats['away'].get('passes'),
        stats['home'].get('pass_accuracy'),
        stats['away'].get('pass_accuracy'),
    )
    return stats


def _basic_match_insight_stats(match):
    stats = {'home': _empty_team_stats(), 'away': _empty_team_stats(), 'available': False}
    score = (match.get('score') or {})
    full_time = score.get('fullTime') or {}
    half_time = score.get('halfTime') or {}
    stats['home']['goals'] = _safe_number(full_time.get('home'))
    stats['away']['goals'] = _safe_number(full_time.get('away'))
    stats['home']['half_time_goals'] = _safe_number(half_time.get('home'))
    stats['away']['half_time_goals'] = _safe_number(half_time.get('away'))
    stats['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in stats[side].values()
    )
    stats['source'] = 'match-score'
    stats['message'] = 'Showing basic match insights while advanced provider statistics are unavailable.'
    stats['unavailable_fields'] = [
        key
        for key in STAT_ALIASES.keys()
        if stats['home'].get(key) is None and stats['away'].get(key) is None
    ]
    return stats


def _merge_stats(primary, fallback):
    if not fallback or not fallback.get('available'):
        return primary
    merged = {
        'home': dict(primary.get('home') or _empty_team_stats()),
        'away': dict(primary.get('away') or _empty_team_stats()),
        'available': primary.get('available') or fallback.get('available'),
        'source': primary.get('source') or fallback.get('source'),
        'message': primary.get('message') if primary.get('available') else fallback.get('message'),
    }
    sources = []
    if primary.get('available'):
        sources.append(primary.get('source') or 'football-data.org')
    if fallback.get('available'):
        sources.append(fallback.get('source') or 'football-data.co.uk')
    merged['sources'] = sorted(set(filter(bool, sources)))

    for side in ('home', 'away'):
        for key, value in (fallback.get(side) or {}).items():
            if merged[side].get(key) is None and value is not None:
                merged[side][key] = value

    merged['available'] = any(
        value is not None
        for side in ('home', 'away')
        for value in merged[side].values()
    )
    merged['unavailable_fields'] = [
        key
        for key in STAT_ALIASES.keys()
        if merged['home'].get(key) is None and merged['away'].get(key) is None
    ]
    return merged


def _stats_diagnostics(match, primary_meta=None, api_football_meta=None, sportsdb_meta=None, fallback_meta=None, fallback_row=None):
    home = match.get('homeTeam') or {}
    away = match.get('awayTeam') or {}
    primary_home_stats = home.get('statistics') or match.get('homeStatistics') or {}
    primary_away_stats = away.get('statistics') or match.get('awayStatistics') or {}
    return {
        'fixture_id': match.get('id'),
        'home_team': home.get('shortName') or home.get('name'),
        'away_team': away.get('shortName') or away.get('name'),
        'football_data_org': {
            'request_url': (primary_meta or {}).get('url'),
            'status': (primary_meta or {}).get('status'),
            'cache_hit': (primary_meta or {}).get('cache_hit', False),
            'payload_keys': (primary_meta or {}).get('payload_keys', []),
            'payload_excerpt': (primary_meta or {}).get('payload_excerpt'),
            'home_statistics_keys': list(primary_home_stats.keys()) if isinstance(primary_home_stats, dict) else [],
            'away_statistics_keys': list(primary_away_stats.keys()) if isinstance(primary_away_stats, dict) else [],
        },
        'api_football': {
            'fixture_id': (api_football_meta or {}).get('fixture_id'),
            'lookup_url': ((api_football_meta or {}).get('fixture_lookup') or {}).get('lookup_url'),
            'lookup_status': (((api_football_meta or {}).get('fixture_lookup') or {}).get('lookup') or {}).get('status'),
            'request_url': ((api_football_meta or {}).get('stats_request') or {}).get('url'),
            'status': ((api_football_meta or {}).get('stats_request') or {}).get('status'),
            'cache_hit': ((api_football_meta or {}).get('stats_request') or {}).get('cache_hit', False),
            'error': (api_football_meta or {}).get('error'),
        },
        'football_data_uk': {
            'request_url': (fallback_meta or {}).get('url'),
            'status': (fallback_meta or {}).get('status'),
            'cache_hit': (fallback_meta or {}).get('cache_hit', False),
            'row_count': (fallback_meta or {}).get('row_count'),
            'matched_row': {
                key: fallback_row.get(key)
                for key in ('Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'HS', 'AS', 'HST', 'AST', 'HF', 'AF', 'HC', 'AC', 'HY', 'AY', 'HR', 'AR')
                if fallback_row and key in fallback_row
            } if fallback_row else None,
        },
        'thesportsdb': {
            'event_search_url': ((sportsdb_meta or {}).get('event_search') or {}).get('url'),
            'event_search_status': ((sportsdb_meta or {}).get('event_search') or {}).get('status'),
            'stats_request_url': ((sportsdb_meta or {}).get('stats_request') or {}).get('url'),
            'stats_request_status': ((sportsdb_meta or {}).get('stats_request') or {}).get('status'),
            'matched_event': (sportsdb_meta or {}).get('matched_event'),
        },
    }


def _match_events(match):
    events = []
    for goal in match.get('goals') or []:
        team = goal.get('team') or {}
        scorer = goal.get('scorer') or {}
        assist = goal.get('assist') or {}
        events.append({
            'minute': goal.get('minute'),
            'injury_time': goal.get('injuryTime'),
            'type': 'goal',
            'team': team.get('name'),
            'player': scorer.get('name'),
            'assist': assist.get('name'),
            'label': 'Goal',
        })

    for booking in match.get('bookings') or []:
        team = booking.get('team') or {}
        player = booking.get('player') or {}
        card = booking.get('card') or 'CARD'
        events.append({
            'minute': booking.get('minute'),
            'injury_time': booking.get('injuryTime'),
            'type': str(card).lower(),
            'team': team.get('name'),
            'player': player.get('name'),
            'label': str(card).replace('_', ' ').title(),
        })

    return sorted(
        events,
        key=lambda item: (
            item.get('minute') if item.get('minute') is not None else 999,
            item.get('injury_time') if item.get('injury_time') is not None else 0,
        ),
    )


def _score_for_team(match, team_api_id):
    score = (match.get('score') or {}).get('fullTime') or {}
    home_id = (match.get('homeTeam') or {}).get('id')
    away_id = (match.get('awayTeam') or {}).get('id')
    if team_api_id == home_id:
        return score.get('home')
    if team_api_id == away_id:
        return score.get('away')
    return None


def _team_names_match(left, right):
    left_name = canonical_team_name(left)
    right_name = canonical_team_name(right)
    if not left_name or not right_name:
        return False
    return left_name == right_name or left_name in right_name or right_name in left_name


def _player_team_side(player, match):
    home = match.get('homeTeam') or {}
    away = match.get('awayTeam') or {}
    team_api_id = getattr(player, 'team_api_id', None)

    if team_api_id is not None:
        if str(team_api_id) == str(home.get('id')):
            return 'home'
        if str(team_api_id) == str(away.get('id')):
            return 'away'

    team_name = getattr(player, 'team_name', '') or ''
    home_name = home.get('name') or home.get('shortName')
    away_name = away.get('name') or away.get('shortName')
    if _team_names_match(team_name, home_name):
        return 'home'
    if _team_names_match(team_name, away_name):
        return 'away'
    return None


def _score_for_side(match, side):
    score = (match.get('score') or {}).get('fullTime') or {}
    if side == 'home':
        return score.get('home')
    if side == 'away':
        return score.get('away')
    return None


def _opponent_for_side(match, side):
    home = match.get('homeTeam') or {}
    away = match.get('awayTeam') or {}
    opponent = away if side == 'home' else home
    return opponent.get('shortName') or opponent.get('name')


def _result_for_side(match, side):
    team_goals = _safe_number(_score_for_side(match, side))
    opponent_goals = _safe_number(_score_for_side(match, 'away' if side == 'home' else 'home'))
    if team_goals is None or opponent_goals is None:
        return {'result': None, 'fantasy_points': None}
    team_display = int(team_goals) if team_goals.is_integer() else team_goals
    opponent_display = int(opponent_goals) if opponent_goals.is_integer() else opponent_goals
    if team_goals == opponent_goals:
        return {'result': f'D {team_display}-{opponent_display}', 'fantasy_points': 1}
    won = team_goals > opponent_goals
    return {
        'result': f"{'W' if won else 'L'} {team_display}-{opponent_display}",
        'fantasy_points': 3 if won else 0,
    }


def _player_name_matches(left, right):
    def normalize(value):
        return re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()).strip()

    left_name = normalize(left)
    right_name = normalize(right)
    if not left_name or not right_name:
        return False
    return left_name == right_name or left_name in right_name or right_name in left_name


def _player_goal_contributions(player, match):
    goals = match.get('goals')
    if not isinstance(goals, list):
        return None, None

    goal_count = 0
    assist_count = 0
    for goal in goals:
        if not isinstance(goal, dict):
            continue
        scorer = (goal.get('scorer') or {}).get('name') or goal.get('player')
        assist = (goal.get('assist') or {}).get('name') or goal.get('assistName')
        if _player_name_matches(player.name, scorer):
            goal_count += 1
        if _player_name_matches(player.name, assist):
            assist_count += 1
    return goal_count, assist_count


def _api_football_response_rows(data):
    if not isinstance(data, dict):
        return []
    rows = data.get('response') or []
    if isinstance(rows, dict):
        return [rows]
    return [row for row in rows if isinstance(row, dict)]


def _best_api_football_player_stat(player, data):
    rows = _api_football_response_rows(data)
    player_name = getattr(player, 'name', '') or ''
    team_name = getattr(player, 'team_name', '') or ''
    best_stat = None

    for row in rows:
        api_player = row.get('player') or {}
        if player_name and not _player_name_matches(player_name, api_player.get('name')):
            continue

        for stat in row.get('statistics') or []:
            if not isinstance(stat, dict):
                continue
            stat = {
                **stat,
                'player': api_player,
                'seasonStats': row.get('seasonStats') or row.get('stats') or {},
            }
            stat_team = stat.get('team') or {}
            if team_name and _team_names_match(team_name, stat_team.get('name')):
                return stat
            if best_stat is None:
                best_stat = stat

    return best_stat


def _season_from_finished_matches(finished_matches):
    for match in sorted(finished_matches or [], key=_match_sort_kickoff, reverse=True):
        start_date = (match.get('season') or {}).get('startDate')
        if start_date:
            try:
                return int(str(start_date)[:4])
            except (TypeError, ValueError):
                pass
        kickoff = match.get('utcDate') or match.get('kickoff')
        if kickoff:
            try:
                year = int(str(kickoff)[:4])
                month = int(str(kickoff)[5:7])
                return year if month >= 7 else year - 1
            except (TypeError, ValueError):
                continue
    now = timezone.now()
    return now.year if now.month >= 7 else now.year - 1


def _player_season_stats(player, finished_matches=None):
    if not player:
        return {'goals': None, 'assists': None, 'matches_played': None, 'minutes': None, 'rating': None}

    season = _season_from_finished_matches(finished_matches or [])
    try:
        data = fetch_api_football_player_stats(player_name=player.name, season=season)
    except Exception as exc:
        logger.warning("Unable to fetch API-FOOTBALL player stats for %s: %s", player.name, exc)
        data = {}

    stat = _best_api_football_player_stat(player, data)
    if not stat and season:
        try:
            data = fetch_api_football_player_stats(player_name=player.name)
            stat = _best_api_football_player_stat(player, data)
        except Exception as exc:
            logger.warning("Unable to fetch current API-FOOTBALL player stats for %s: %s", player.name, exc)

    return {
        'goals': _first_safe_number(stat or {}, ('goals', 'total'), 'goals', ('player', 'goals'), ('seasonStats', 'goals')),
        'assists': _first_safe_number(stat or {}, ('goals', 'assists'), 'assists'),
        'matches_played': _first_safe_number(stat or {}, ('games', 'appearences'), ('games', 'appearances'), ('games', 'played'), 'matches_played'),
        'minutes': _first_safe_number(stat or {}, ('games', 'minutes'), 'minutes'),
        'rating': _first_safe_number(stat or {}, ('games', 'rating'), 'rating'),
    }


def _fixture_player_rows(api_data):
    rows = []
    for team_row in _api_football_response_rows(api_data):
        for player_row in team_row.get('players') or []:
            if not isinstance(player_row, dict):
                continue
            rows.append(player_row)
    return rows


def _find_fixture_player_row(player, api_data):
    for row in _fixture_player_rows(api_data):
        api_player = row.get('player') or {}
        if str(api_player.get('id')) == str(getattr(player, 'player_api_id', '')):
            return row
        if _player_name_matches(getattr(player, 'name', ''), api_player.get('name')):
            return row
    return None


def _player_performance_from_match(player, match):
    side = _player_team_side(player, match)
    if not side:
        return None

    player_stats = None
    for raw_player in match.get('players') or match.get('playerStats') or []:
        if not isinstance(raw_player, dict):
            continue
        raw_player_data = raw_player.get('player') if isinstance(raw_player.get('player'), dict) else {}
        raw_id = (
            raw_player.get('id')
            or raw_player.get('player_id')
            or raw_player.get('playerId')
            or raw_player_data.get('id')
        )
        raw_name = (
            raw_player.get('name')
            or raw_player.get('player_name')
            or raw_player_data.get('name')
            or raw_player.get('player')
        )
        if str(raw_id) == str(player.player_api_id) or _player_name_matches(player.name, raw_name):
            player_stats = raw_player
            break

    stats_source = player_stats or {}
    if isinstance(stats_source.get('statistics'), list) and stats_source.get('statistics'):
        stats_source = stats_source['statistics'][0]

    event_goals, event_assists = _player_goal_contributions(player, match)
    goals = _first_safe_number(stats_source, ('goals', 'total'), 'goals', 'numberOfGoals')
    assists = _first_safe_number(stats_source, ('goals', 'assists'), 'assists')
    if goals is None:
        goals = event_goals
    if assists is None:
        assists = event_assists

    kickoff = match.get('utcDate') or match.get('kickoff')
    result = _result_for_side(match, side)

    # football-data.org usually does not expose per-player box scores on the free match endpoint.
    return {
        'match_id': match.get('id'),
        'matchweek': match.get('matchday'),
        'kickoff': kickoff,
        'date': str(kickoff)[:10] if kickoff else None,
        'opponent': _opponent_for_side(match, side),
        'result': result['result'],
        'team_goals': _score_for_side(match, side),
        'goals': goals,
        'assists': assists,
        'passes_completed': _first_safe_number(stats_source, ('passes', 'total'), 'passes_completed', 'passesCompleted'),
        'tackles': _first_safe_number(stats_source, ('tackles', 'total'), 'tackles'),
        'saves': _first_safe_number(stats_source, ('goals', 'saves'), 'saves'),
        'minutes': _first_safe_number(stats_source, ('games', 'minutes'), 'minutes', 'minutesPlayed'),
        'rating': _first_safe_number(stats_source, ('games', 'rating'), 'rating', 'score', 'performance_score'),
        'fantasy_points': result['fantasy_points'],
        'data_available': bool(player_stats) or event_goals is not None,
    }


def _recent_player_performance(player, finished_matches, limit=3):
    player_matches = []
    for match in sorted(finished_matches, key=_match_sort_kickoff, reverse=True):
        if not _player_team_side(player, match):
            continue

        detail = match
        if match.get('id') and match.get('source') != 'football-data.co.uk':
            try:
                fetched_detail = fetch_match(match.get('id'))
                if isinstance(fetched_detail, dict) and fetched_detail:
                    detail = {**match, **fetched_detail}
            except Exception as exc:
                logger.warning("Unable to enrich watchlist match %s: %s", match.get('id'), exc)

            try:
                fixture_player_stats = fetch_api_football_fixture_player_stats_for_match(detail)
                fixture_player_row = _find_fixture_player_row(player, fixture_player_stats)
                if fixture_player_row:
                    detail = {
                        **detail,
                        'playerStats': [fixture_player_row],
                    }
            except Exception as exc:
                logger.warning("Unable to fetch API-FOOTBALL player performance for match %s: %s", match.get('id'), exc)

        item = _player_performance_from_match(player, detail)
        if item:
            player_matches.append(item)
        if len(player_matches) == limit:
            break
    return player_matches


def _clean_watchlist_items(items, limit=MAX_WATCHLIST_PLAYERS):
    rows = []
    seen_ids = set()
    for item in list(items or []):
        if not isinstance(item, dict):
            continue
        player_id = item.get('id')
        if player_id is None:
            continue
        key = str(player_id)
        if key in seen_ids:
            continue
        seen_ids.add(key)
        rows.append(item)
        if limit and len(rows) >= limit:
            break
    return rows


def _coerce_player_api_id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _player_by_api_id(value):
    player_id = _coerce_player_api_id(value)
    if player_id is None:
        return None
    return Player.objects.filter(player_api_id=player_id).first()


def _player_by_watchlist_item(item):
    player = _player_by_api_id(item.get('id'))
    if player:
        return player

    name = (item.get('name') or item.get('player_name') or '').strip()
    if not name:
        return None

    player = Player.objects.filter(name__iexact=name).first()
    if player:
        return player

    return Player.objects.filter(name__icontains=name).order_by('name').first()


def _api_player_details_for_item(item):
    player_id = _coerce_player_api_id(item.get('id'))
    player_name = (item.get('name') or item.get('player_name') or '').strip()
    if player_id is None and not player_name:
        return {}

    try:
        teams = fetch_pl_teams()
    except Exception as exc:
        logger.warning("Unable to fetch teams for watchlist enrichment: %s", exc)
        return {}

    for team in teams:
        team_id = team.get('id')
        if not team_id:
            continue
        try:
            squad = fetch_team_players(team_id)
        except Exception as exc:
            logger.warning("Unable to fetch squad %s for watchlist enrichment: %s", team_id, exc)
            continue

        matched = None
        for squad_player in squad:
            if not isinstance(squad_player, dict):
                continue
            if player_id is not None and str(squad_player.get('id')) == str(player_id):
                matched = squad_player
                break
            if player_name and _player_name_matches(player_name, squad_player.get('name')):
                matched = squad_player
                break

        if matched:
            return {
                'id': matched.get('id') or item.get('id'),
                'name': matched.get('name') or item.get('name'),
                'position': _normalize_position_label(matched.get('position')),
                'team': team.get('name') or item.get('team') or item.get('club'),
                'team_api_id': team_id,
                'nationality': matched.get('nationality') or item.get('nationality'),
                'date_of_birth': matched.get('dateOfBirth') or item.get('date_of_birth'),
            }

    return {}


def _watchlist_base_payload(item, player=None):
    api_details = {}
    item_has_position = bool(_first_non_empty(item.get('position')))
    item_has_team = bool(_first_non_empty(item.get('team'), item.get('team_name'), item.get('club')))
    item_has_name = bool(_first_non_empty(item.get('name'), item.get('player_name')))
    needs_enrichment = not (item_has_position and item_has_team and item_has_name)

    if player and (not _first_non_empty(player.position) or not _first_non_empty(player.team_name)):
        needs_enrichment = True
    if not player:
        needs_enrichment = True

    if needs_enrichment:
        api_details = _api_player_details_for_item(item)

    if player and api_details:
        update_fields = []
        api_position = _normalize_position_label(api_details.get('position'))
        api_team = api_details.get('team')
        api_team_id = api_details.get('team_api_id')
        if api_position and not _first_non_empty(player.position):
            player.position = api_position
            update_fields.append('position')
        if api_team and not _first_non_empty(player.team_name):
            player.team_name = api_team
            update_fields.append('team_name')
        if api_team_id and not player.team_api_id:
            player.team_api_id = api_team_id
            update_fields.append('team_api_id')
        if update_fields:
            player.save(update_fields=update_fields)

    if player:
        payload = _player_payload(player)
    else:
        payload = {
            'id': _first_non_empty(api_details.get('id'), item.get('id')),
            'name': _first_non_empty(api_details.get('name'), item.get('name'), item.get('player_name'), 'Unknown player'),
            'position': _normalize_position_label(_first_non_empty(api_details.get('position'), item.get('position'))),
            'team': _first_non_empty(api_details.get('team'), item.get('team'), item.get('team_name'), item.get('club'), ''),
            'team_api_id': _first_non_empty(api_details.get('team_api_id'), item.get('team_api_id')),
            'nationality': _first_non_empty(api_details.get('nationality'), item.get('nationality'), ''),
            'date_of_birth': _first_non_empty(api_details.get('date_of_birth'), item.get('date_of_birth')),
            'value': _first_non_empty(item.get('value'), item.get('cost')),
        }

    payload['position'] = _normalize_position_label(_first_non_empty(
        payload.get('position'),
        api_details.get('position'),
        item.get('position'),
    ))
    payload['team'] = _first_non_empty(
        payload.get('team'),
        api_details.get('team'),
        item.get('team'),
        item.get('team_name'),
        item.get('club'),
        '',
    )
    payload['team_api_id'] = _first_non_empty(payload.get('team_api_id'), api_details.get('team_api_id'), item.get('team_api_id'))
    payload['value'] = _first_non_empty(payload.get('value'), item.get('value'), item.get('cost'))
    payload['added_at'] = item.get('added_at') or timezone.now().isoformat()
    return payload


def _ensure_watchlist_state(team):
    cleaned = _clean_watchlist_items(team.watchlist)
    if cleaned != list(team.watchlist or []):
        team.watchlist = cleaned
        team.save(update_fields=['watchlist'])
    return cleaned


def _watchlist_payload(team, finished_matches=None):
    watchlist = _clean_watchlist_items(team.watchlist)
    finished_matches = finished_matches if finished_matches is not None else fetch_pl_matches(limit=500, status='FINISHED')

    rows = []
    persisted = []
    for item in watchlist:
        player = _player_by_watchlist_item(item)
        payload = _watchlist_base_payload(item, player)
        season_stats = _player_season_stats(player, finished_matches) if player else {
            'goals': _first_safe_number(item, 'goals', ('statistics', 'goals', 'total'), ('goals', 'total'), ('playerStats', 'goals'), ('player', 'goals'), ('seasonStats', 'goals')),
            'assists': _first_safe_number(item, 'assists', ('statistics', 'goals', 'assists'), ('goals', 'assists')),
            'matches_played': _first_safe_number(item, 'matches_played', ('games', 'appearences'), ('games', 'appearances')),
            'minutes': _first_safe_number(item, 'minutes', ('games', 'minutes')),
            'rating': _first_safe_number(item, 'rating', ('games', 'rating')),
        }
        payload['season_stats'] = season_stats
        payload['goals'] = season_stats.get('goals')
        payload['assists'] = season_stats.get('assists')
        payload['matches_played'] = season_stats.get('matches_played')
        persisted.append({
            key: payload.get(key)
            for key in (
                'id',
                'name',
                'position',
                'team',
                'team_api_id',
                'nationality',
                'date_of_birth',
                'value',
                'added_at',
            )
            if payload.get(key) not in (None, '')
        })
        payload['recent_performance'] = _recent_player_performance(player, finished_matches) if player else []
        payload['performance_available'] = any(
            entry.get('data_available') for entry in payload['recent_performance']
        )
        rows.append(payload)

    if persisted != list(team.watchlist or [])[:len(persisted)]:
        team.watchlist = persisted
        team.save(update_fields=['watchlist'])
    return rows


def _notification_sort_key(item):
    return _coerce_datetime(item.get('created_at')) or datetime.min.replace(tzinfo=dt_timezone.utc)


def _send_notification_email(team_id, notification_id, recipient_email):
    try:
        team = UserTeam.objects.select_related('user').get(pk=team_id)
        notification = next(
            (item for item in list(team.notifications or []) if str(item.get('id')) == str(notification_id)),
            None,
        )
        if not notification or notification.get('email_sent') or not recipient_email:
            return
        subject, body = fantasy_notification_email(notification, team.user)
        subject = f"{settings.FANTASY_EMAIL_SUBJECT_PREFIX} {subject}".strip()
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient_email], fail_silently=False)

        notifications = list(team.notifications or [])
        for item in notifications:
            if str(item.get('id')) == str(notification_id):
                item['email_sent'] = True
                item['email_sent_at'] = timezone.now().isoformat()
                item.pop('email_error', None)
                break
        team.notifications = notifications
        team.save(update_fields=['notifications'])
    except Exception as exc:
        logger.exception("Failed to send notification email %s", notification_id)
        try:
            team = UserTeam.objects.get(pk=team_id)
            notifications = list(team.notifications or [])
            for item in notifications:
                if str(item.get('id')) == str(notification_id):
                    item['email_error'] = str(exc)[:240]
                    item['email_queued'] = False
                    break
            team.notifications = notifications
            team.save(update_fields=['notifications'])
        except Exception:
            logger.exception("Failed to store notification email error")


def _queue_notification_email(team, notification):
    if not getattr(settings, 'FANTASY_EMAIL_NOTIFICATIONS_ENABLED', False):
        return
    if notification.get('email_sent') or notification.get('email_queued'):
        return
    recipient_email = (team.user.email or '').strip()
    if not recipient_email:
        return

    notification['email_queued'] = True
    if getattr(settings, 'FANTASY_EMAIL_ASYNC', True):
        timer = threading.Timer(
            0.25,
            _send_notification_email,
            args=(team.pk, notification.get('id'), recipient_email),
        )
        timer.daemon = True
        timer.start()
    else:
        _send_notification_email(team.pk, notification.get('id'), recipient_email)


def _append_notification_once(team, key, message, notification_type='info', email_subject=None, email_body=None):
    notifications = list(team.notifications or [])
    existing = next((item for item in notifications if isinstance(item, dict) and item.get('key') == key), None)
    if existing:
        return False

    notification = {
        'id': key,
        'key': key,
        'type': notification_type,
        'message': message,
        'created_at': timezone.now().isoformat(),
        'read': False,
        'email_sent': False,
        'email_queued': False,
    }
    if email_subject:
        notification['email_subject'] = email_subject
    if email_body:
        notification['email_body'] = email_body

    notifications.append(notification)
    team.notifications = sorted(notifications[-60:], key=_notification_sort_key, reverse=True)
    _queue_notification_email(team, notification)
    return True


def _ensure_user_notifications(team, matches=None):
    matches = matches if matches is not None else fetch_pl_matches(limit=None)
    now = timezone.now()
    cleaned_notifications = [
        item for item in list(team.notifications or [])
        if not str((item or {}).get('key') or (item or {}).get('id') or '').startswith('transfer-reminder:')
        and (item or {}).get('type') != 'transfer'
    ]
    if cleaned_notifications != list(team.notifications or []):
        team.notifications = cleaned_notifications
        team.save(update_fields=['notifications'])

    upcoming = sorted(
        [
            match for match in matches
            if match.get('status') in {'SCHEDULED', 'TIMED'} and _match_kickoff(match)
        ],
        key=_match_sort_kickoff,
    )
    changed = False

    if upcoming:
        next_match = upcoming[0]
        kickoff = _match_kickoff(next_match)
        matchweek = next_match.get('matchday') or 'upcoming'
        home = (next_match.get('homeTeam') or {}).get('shortName') or (next_match.get('homeTeam') or {}).get('name')
        away = (next_match.get('awayTeam') or {}).get('shortName') or (next_match.get('awayTeam') or {}).get('name')
        readable_kickoff = kickoff.strftime('%d %b %Y %H:%M UTC') if kickoff else 'soon'
        changed = _append_notification_once(
            team,
            f"matchweek:{matchweek}:{next_match.get('id')}",
            f"Matchweek {matchweek} starts with {home} vs {away} on {readable_kickoff}.",
            'matchweek',
            email_subject=f"Upcoming matchweek {matchweek} reminder",
        ) or changed
        if kickoff and timedelta(hours=0) <= (kickoff - now) <= timedelta(days=3):
            changed = _append_notification_once(
                team,
                f"deadline:{matchweek}:{next_match.get('id')}",
                f"Transfer deadline reminder: review your squad before {home} vs {away}.",
                'deadline',
                email_subject='Transfer deadline alert',
            ) or changed

    if team.weekly_points:
        weeks = sorted([int(key) for key in team.weekly_points.keys() if str(key).isdigit()])
        if weeks:
            latest_week = weeks[-1]
            changed = _append_notification_once(
                team,
                f"weekly-summary:{latest_week}:{team.points}",
                f"Weekly summary: Matchweek {latest_week} is logged and your total is now {team.points} points.",
                'summary',
                email_subject='Weekly fantasy performance summary',
            ) or changed

    if changed:
        team.save(update_fields=['notifications'])

    return sorted(list(team.notifications or []), key=_notification_sort_key, reverse=True)


class GoogleLoginView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        token = request.data.get('credential')
        if not token:
            return Response({'detail': 'Credential is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Specify the CLIENT_ID of the app that accesses the backend:
            # We will use settings to manage the client ID
            client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', None)
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)

            # ID token is valid. Get the user's Google Account ID from the decoded token.
            email = idinfo['email']
            first_name = idinfo.get('given_name', '')
            last_name = idinfo.get('family_name', '')
            username = email.split('@')[0]

            # Find or create user
            user, created = User.objects.get_or_create(email__iexact=email, defaults={
                'email': email,
                'username': username,
                'is_active': True,
                'first_name': first_name,
                'last_name': last_name,
            })

            if created:
                # Random password since they login via Google
                user.set_unusable_password()
                user.save()

            # Create standard JWT tokens
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': _user_payload(user, request),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
            })

        except ValueError:
            # Invalid token
            return Response({'detail': 'Invalid Google token.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Catch any other error to prevent HTML responses
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DirectLoginView(APIView):
    """Direct login without 2FA - returns tokens immediately."""
    permission_classes = (AllowAny,)

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response({'detail': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=email, password=password)

        if user is not None:
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': _user_payload(user, request),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
            })

        return Response({'detail': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)


class AdminLoginView(APIView):
    """Authenticate real staff users and return standard JWT admin tokens."""
    permission_classes = (AllowAny,)

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response({'detail': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_staff:
            return Response({'detail': 'Invalid admin credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        return Response({
            'admin': _user_payload(user, request),
            'user': _user_payload(user, request),
            'token': str(refresh.access_token),
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'Admin login successful',
        }, status=status.HTTP_200_OK)


class Request2FAView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response({'detail': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=email, password=password)

        if user is not None:
            # Generate tokens immediately
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': _user_payload(user, request),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
            })
        
        return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)


class Verify2FAView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        email = request.data.get('email')
        code = request.data.get('code')

        if not email or not code:
            return Response({'detail': 'Email and code are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({'detail': 'Invalid request.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Check code from AdminProfile if staff, else from User
        is_valid = False
        if user.is_staff:
            try:
                profile = AdminProfile.objects.get(email__iexact=email)
                if profile.two_factor_code == code and profile.two_factor_expiry > timezone.now():
                    is_valid = True
                    profile.two_factor_code = None
                    profile.two_factor_expiry = None
                    profile.save()
            except AdminProfile.DoesNotExist:
                pass
        else:
            if user.two_factor_code == code and user.two_factor_expiry > timezone.now():
                is_valid = True
                user.two_factor_code = None
                user.two_factor_expiry = None
                user.save()

        if is_valid:
            # Generate tokens
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': _user_payload(user, request),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
            })
        
        return Response({'detail': 'Invalid or expired code.'}, status=status.HTTP_401_UNAUTHORIZED)


class RequestSignupCodeView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if user already exists
        if User.objects.filter(email__iexact=email).exists():
            return Response({'detail': 'A user with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        if (
            settings.EMAIL_BACKEND == getattr(settings, 'SMTP_EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
            and (not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD)
        ):
            logger.error('Signup verification email is not configured.')
            return Response(
                {'detail': 'Email service is not configured. Please contact support.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Generate 6-digit code
        code = ''.join(random.choices(string.digits, k=6))
        
        # Create a signed token (valid for 10 minutes)
        signup_data = {'email': email, 'code': code, 'timestamp': timezone.now().timestamp()}
        signup_token = signing.dumps(signup_data)

        # Send email
        try:
            send_mail(
                'Your Signup Verification Code',
                f'Your verification code is: {code}. It expires in 10 minutes.',
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
        except Exception:
            logger.exception('Signup verification email failed for %s', email)
            return Response(
                {'detail': 'Unable to send verification code. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        else:
            print(f"### EMAIL SENT SUCCESSFULLY to {email}")

        response_data = {
            'detail': 'Verification code sent.',
            'signup_token': signup_token
        }

        return Response(response_data)


class RegisterView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        username = request.data.get('username')
        password = request.data.get('password')
        code = (request.data.get('code') or '').strip()
        signup_token = (request.data.get('signup_token') or '').strip()

        if not all([email, username, password, code, signup_token]):
            return Response({'detail': 'All fields and verification code are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Verify token
        try:
            data = signing.loads(signup_token, max_age=600) # 10 minute expiry
            token_email = (data.get('email') or '').strip().lower()
            token_code = str(data.get('code') or '').strip()
            if token_email != email or not constant_time_compare(token_code, code):
                return Response({'detail': 'Invalid verification code or email mismatch.'}, status=status.HTTP_400_BAD_REQUEST)
        except signing.SignatureExpired:
            return Response({'detail': 'Verification code has expired.'}, status=status.HTTP_400_BAD_REQUEST)
        except signing.BadSignature:
            return Response({'detail': 'Invalid verification token.'}, status=status.HTTP_400_BAD_REQUEST)

        # Proceed with registration
        serializer = RegisterSerializer(data={'email': email, 'username': username, 'password': password})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=['is_active'])
        
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'user': _user_payload(user, request),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class EmailTokenObtainPairView(TokenObtainPairView):
    permission_classes = (AllowAny,)
    serializer_class = EmailTokenObtainPairSerializer


class AdminStatsView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        admins = User.objects.filter(is_staff=True).count()
        locked_users = User.objects.filter(is_active=False).count()
        return Response(
            {
                'total_users': total_users,
                'active_users': active_users,
                'admins': admins,
                'locked_users': locked_users,
            }
        )


class AdminUsersView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        users = User.objects.all().order_by('email')
        return Response([_admin_user_payload(user) for user in users])


class AdminUserDetailView(APIView):
    permission_classes = (IsAdminUser,)

    def patch(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        for field in ('is_staff', 'is_active'):
            if field in request.data:
                setattr(user, field, bool(request.data.get(field)))
        if 'role' in request.data:
            user.is_staff = request.data.get('role') == 'admin'

        if str(request.user.pk) == str(user.pk) and not user.is_staff:
            return Response(
                {'detail': 'You cannot remove your own admin access.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.save()

        return Response(_admin_user_payload(user))

    def delete(self, request, user_id):
        if str(request.user.pk) == str(user_id):
            return Response({'detail': 'You cannot delete your own admin account.'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = User.objects.filter(pk=user_id).delete()
        if not deleted:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminPlayersView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        players = Player.objects.all().order_by('team_name', 'name')
        return Response([_player_payload(player) for player in players])

    def post(self, request):
        required = ['name', 'position']
        missing = [field for field in required if not request.data.get(field)]
        if missing:
            return Response(
                {'detail': f"Missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player_api_id = request.data.get('player_api_id')
        if player_api_id is None:
            last_player = Player.objects.order_by('-player_api_id').first()
            player_api_id = (last_player.player_api_id + 1) if last_player else 1

        player, created = Player.objects.update_or_create(
            player_api_id=int(player_api_id),
            defaults={
                'name': request.data.get('name'),
                'position': request.data.get('position'),
                'nationality': request.data.get('nationality', ''),
                'team_name': request.data.get('team_name') or request.data.get('team', ''),
                'team_api_id': request.data.get('team_api_id') or None,
                'cost': Decimal(str(request.data.get('cost') or request.data.get('value') or '5000000.00')),
            },
        )
        try:
            _apply_player_ban_fields(player, request.data)
        except (TypeError, ValueError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        player.save()
        return Response(_player_payload(player), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AdminPlayerDetailView(APIView):
    permission_classes = (IsAdminUser,)

    def patch(self, request, player_id):
        player = Player.objects.filter(player_api_id=player_id).first()
        if not player:
            return Response({'detail': 'Player not found.'}, status=status.HTTP_404_NOT_FOUND)

        disabled_fields = {'name', 'position', 'team', 'team_name', 'team_api_id', 'nationality', 'cost', 'value'}
        if disabled_fields.intersection(request.data.keys()):
            return Response(
                {'detail': 'Editing player details is disabled. Only ban settings can be updated.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            _apply_player_ban_fields(player, request.data)
        except (TypeError, ValueError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        player.save()
        return Response(_player_payload(player))

    def delete(self, request, player_id):
        return Response(
            {'detail': 'Deleting players is disabled.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class PlayerSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        query = (request.query_params.get('q') or '').strip()
        if len(query) < 2:
            return Response([])

        players = Player.objects.filter(name__icontains=query).order_by('name')[:10]
        return Response([player.name for player in players])


class AdminMatchesView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        requested_status = request.query_params.get('status')
        admin_matches = AdminMatch.objects.all().order_by('-created_at')
        if requested_status:
            admin_matches = admin_matches.filter(status__iexact=requested_status)
        api_matches = fetch_pl_matches(limit=None, status=requested_status)
        return Response(
            [_admin_match_payload(match) for match in admin_matches]
            + [_match_payload(match) for match in api_matches]
        )

    def post(self, request):
        home_team = request.data.get('home_team')
        away_team = request.data.get('away_team')
        if not home_team or not away_team:
            return Response({'detail': 'Home team and away team are required.'}, status=status.HTTP_400_BAD_REQUEST)

        match = AdminMatch.objects.create(
            home_team=home_team,
            away_team=away_team,
            matchday=int(request.data.get('matchday') or 1),
            status=request.data.get('status') or 'Scheduled',
            home_score=_optional_int(request.data.get('home_score')),
            away_score=_optional_int(request.data.get('away_score')),
        )
        return Response(_admin_match_payload(match), status=status.HTTP_201_CREATED)


class AdminMatchDetailView(APIView):
    permission_classes = (IsAdminUser,)

    def patch(self, request, match_id):
        match = AdminMatch.objects.filter(pk=match_id).first()
        if not match:
            return Response({'detail': 'Admin-managed match not found.'}, status=status.HTTP_404_NOT_FOUND)

        for field in ('home_team', 'away_team', 'status'):
            if field in request.data:
                setattr(match, field, request.data.get(field))
        if 'matchday' in request.data:
            match.matchday = int(request.data.get('matchday') or match.matchday)
        if 'home_score' in request.data:
            match.home_score = _optional_int(request.data.get('home_score'))
        if 'away_score' in request.data:
            match.away_score = _optional_int(request.data.get('away_score'))
        match.save()
        return Response(_admin_match_payload(match))

    def delete(self, request, match_id):
        deleted, _ = AdminMatch.objects.filter(pk=match_id).delete()
        if not deleted:
            return Response({'detail': 'Admin-managed match not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserDashboardView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            team = UserTeam.objects.filter(user=request.user).first()
            if not team:
                team = UserTeam.objects.create(user=request.user, budget=BASE_BUDGET)
            team = _ensure_team_defaults(team)
            
            # Basic consistency check: reset budget if empty team has 0 budget
            current_budget = float(team.budget)
            if current_budget == 0 and not _clean_players(team.players):
                team.budget = BASE_BUDGET
                team.save()
                
            return Response(
                {
                    'points': team.points,
                    'rank': team.rank,
                    'budget': float(team.budget),
                    'team_size': len(_lineup_for_points(team)),
                    'owned_count': len(_clean_players(team.players)),
                    'watchlist_count': len(team.watchlist or []),
                    'rewards': team.rewards or [],
                    'last_synced_at': team.last_synced_at.isoformat() if team.last_synced_at else None,
                    'points_history': [
                        {'week': f"MW {week}", 'points': int((team.weekly_points or {}).get(str(week), 0))}
                        for week in sorted([int(key) for key in (team.weekly_points or {}).keys() if str(key).isdigit()])[-6:]
                    ],
                }
            )
        except Exception as e:
            import traceback
            trace = traceback.format_exc()
            logger.exception("ERROR in UserDashboardView: %s", e)
            return Response({'detail': f"Backend Error: {str(e)}", 'traceback': trace[:500]}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserTeamView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        team = _ensure_team_defaults(team)
        
        # Trigger automatic point sync on dashboard load
        sync_user_points(request.user)
        # Reload team after sync
        team.refresh_from_db()
        owned_players = _clean_players(team.players)
        active_squad = _active_squad(team)
        _sync_team_from_squad(team, active_squad)
        team.save(update_fields=['selected_players', 'formation', 'active_squad_id'])
        selected_players = active_squad.get('selected_players') or []
        
        return Response({
            'budget': float(team.budget),
            'formation': team.formation,
            'squad_id': team.active_squad_id,
            'squad_name': active_squad.get('name', 'Main Squad'),
            'active_squad_id': team.active_squad_id,
            'squads': team.squads or [],
            'players': selected_players,
            'selected_players': selected_players,
            'owned_players': owned_players,
            'owned_count': len(owned_players),
            'max_players': MAX_OWNED_PLAYERS,
            'points': team.points,
            'rank': team.rank,
            'rewards': team.rewards or [],
        })
        
    def post(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        team = _ensure_team_defaults(team)
        squads = _ensure_squads(team)
        action = request.data.get('action', 'update_squad')
        requested_squad_id = request.data.get('squad_id') or team.active_squad_id
        players = request.data.get('players', [])
        formation = request.data.get('formation', '4-4-2')
        owned_players = _clean_players(team.players)

        if action == 'create_squad':
            squad_name = (request.data.get('squad_name') or request.data.get('name') or f"Squad {len(squads) + 1}").strip()
            new_squad = _squad_payload(
                squad_id=uuid.uuid4().hex,
                name=squad_name,
                selected_players=[],
                formation=formation or team.formation,
            )
            squads.append(new_squad)
            team.squads = squads
            _sync_team_from_squad(team, new_squad)
            team.save(update_fields=['squads', 'selected_players', 'formation', 'active_squad_id'])
        elif action == 'switch_squad':
            squad = next((item for item in squads if str(item.get('id')) == str(requested_squad_id)), None)
            if not squad:
                return Response({'detail': 'Squad not found.'}, status=status.HTTP_404_NOT_FOUND)
            _sync_team_from_squad(team, squad)
            team.save(update_fields=['selected_players', 'formation', 'active_squad_id'])
        else:
            squad = next((item for item in squads if str(item.get('id')) == str(requested_squad_id)), None)
            if not squad:
                return Response({'detail': 'Squad not found.'}, status=status.HTTP_404_NOT_FOUND)

            selected_players, error = _validate_selected_players(players, owned_players)
            if error:
                return Response(
                    {'detail': error},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            squad['selected_players'] = selected_players
            squad['formation'] = formation
            squad['layout'] = {'formation': formation}
            if 'squad_name' in request.data or 'name' in request.data:
                squad['name'] = (request.data.get('squad_name') or request.data.get('name') or squad.get('name') or 'Squad').strip()[:80]

            team.squads = squads
            _sync_team_from_squad(team, squad)
            team.save(update_fields=['squads', 'selected_players', 'formation', 'active_squad_id'])

        active_squad = _active_squad(team)
        return Response({
            'budget': float(team.budget),
            'formation': team.formation,
            'squad_id': team.active_squad_id,
            'squad_name': active_squad.get('name', 'Main Squad'),
            'active_squad_id': team.active_squad_id,
            'squads': team.squads or [],
            'players': team.selected_players or [],
            'selected_players': team.selected_players or [],
            'owned_players': owned_players,
            'owned_count': len(owned_players),
            'max_players': MAX_OWNED_PLAYERS,
            'points': team.points,
        })


class UserMatchesView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        matches = fetch_pl_matches(limit=None)
        requested_status = request.query_params.get('status')
        if requested_status:
            allowed = {value.strip().upper() for value in requested_status.split(',') if value.strip()}
            matches = [match for match in matches if match.get('status') in allowed]

        payload = [_match_payload(match) for match in matches]
        payload.sort(key=lambda item: _match_sort_kickoff(item), reverse=True)
        return Response(payload)


def _load_match_detail_by_id(match_id):
    detail = {}
    primary_meta = {}

    try:
        detail, primary_meta = fetch_match(match_id, return_meta=True)
    except Exception as exc:
        primary_meta = {'error': str(exc), 'source': 'football-data.org'}
        logger.exception("Primary match detail provider failed fixture=%s: %s", match_id, exc)

    if not detail:
        try:
            matches = fetch_pl_matches(limit=None)
            detail = next((match for match in matches if str(match.get('id')) == str(match_id)), None)
        except Exception as exc:
            logger.exception("Match list fallback failed fixture=%s: %s", match_id, exc)

    return detail, primary_meta


def _resolve_match_statistics(detail, match_id, primary_meta=None):
    primary_meta = primary_meta or {}
    api_football_meta = {}
    sportsdb_meta = {}
    fallback_meta = {}
    fallback_row = None
    providers_attempted = []
    providers_succeeded = []

    primary_stats = _extract_match_stats(detail)
    provider_stats = primary_stats
    providers_attempted.append('football-data.org')
    if primary_stats.get('available'):
        providers_succeeded.append(primary_stats.get('source') or 'football-data.org')

    try:
        api_football_data, api_football_meta = fetch_api_football_fixture_stats_for_match(detail, return_meta=True)
        api_football_stats = _stats_from_api_football(api_football_data, detail) if api_football_data else {'available': False}
        providers_attempted.append('API-FOOTBALL')
        provider_stats = _merge_stats(provider_stats, api_football_stats)
        if api_football_stats.get('available'):
            providers_succeeded.append('API-FOOTBALL')
    except Exception as exc:
        api_football_meta = {'error': str(exc), 'source': 'API-FOOTBALL'}
        providers_attempted.append('API-FOOTBALL')
        logger.exception("API-FOOTBALL provider failed fixture=%s: %s", match_id, exc)

    try:
        sportsdb_data, sportsdb_meta = fetch_thesportsdb_event_stats(detail, return_meta=True)
        sportsdb_stats = _stats_from_thesportsdb(sportsdb_data) if sportsdb_data else {'available': False}
        providers_attempted.append('TheSportsDB')
        provider_stats = _merge_stats(provider_stats, sportsdb_stats)
        if sportsdb_stats.get('available'):
            providers_succeeded.append('TheSportsDB')
    except Exception as exc:
        sportsdb_meta = {'error': str(exc), 'source': 'TheSportsDB'}
        providers_attempted.append('TheSportsDB')
        logger.exception("TheSportsDB provider failed fixture=%s: %s", match_id, exc)

    final_stats = provider_stats
    try:
        fallback_rows, fallback_meta = fetch_pl_result_stats(
            season_start=(detail.get('season') or {}).get('startDate'),
            return_meta=True,
        )
        fallback_row = _match_result_stats_row(detail, fallback_rows)
        fallback_stats = _stats_from_result_row(fallback_row) if fallback_row else {'available': False}
        providers_attempted.append('football-data.co.uk')
        final_stats = _merge_stats(provider_stats, fallback_stats)
        if fallback_stats.get('available'):
            providers_succeeded.append('football-data.co.uk')
        if not final_stats.get('available'):
            form_stats = _team_form_stats_from_rows(detail, fallback_rows)
            final_stats = _merge_stats(final_stats, form_stats)
            if form_stats.get('available'):
                providers_succeeded.append('team-form-history')
    except Exception as exc:
        fallback_meta = {'error': str(exc), 'source': 'football-data.co.uk'}
        providers_attempted.append('football-data.co.uk')
        final_stats = provider_stats
        logger.exception("football-data.co.uk fallback provider failed fixture=%s: %s", match_id, exc)

    if not final_stats.get('available'):
        basic_stats = _basic_match_insight_stats(detail)
        final_stats = _merge_stats(final_stats, basic_stats)
        if basic_stats.get('available'):
            providers_succeeded.append('match-score')

    final_stats['providers_attempted'] = providers_attempted
    final_stats['providers_succeeded'] = sorted(set(providers_succeeded))
    if not final_stats.get('available'):
        final_stats['message'] = 'Fixture details loaded, but no statistic rows are available for this match yet.'
        logger.warning(
            "No advanced stats available fixture=%s providers_attempted=%s api_football_error=%s",
            match_id,
            providers_attempted,
            (api_football_meta or {}).get('error'),
        )

    diagnostics = _stats_diagnostics(
        detail,
        primary_meta,
        api_football_meta,
        sportsdb_meta,
        fallback_meta,
        fallback_row,
    )

    return final_stats, diagnostics


class UserMatchStatsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, match_id):
        detail, primary_meta = _load_match_detail_by_id(match_id)
        if not detail:
            return Response(
                {
                    'id': match_id,
                    'stats_loaded_from_detail': False,
                    'stats': {
                        'home': _empty_team_stats(),
                        'away': _empty_team_stats(),
                        'available': False,
                        'message': 'Match details are temporarily unavailable. Please retry shortly.',
                        'providers_attempted': ['football-data.org', 'API-FOOTBALL'],
                    },
                },
                status=status.HTTP_200_OK,
            )

        stats_payload, diagnostics = _resolve_match_statistics(detail, match_id, primary_meta=primary_meta)
        if settings.DEBUG or request.query_params.get('debug') == '1':
            stats_payload['diagnostics'] = diagnostics

        return Response(
            {
                'id': match_id,
                'stats_loaded_from_detail': True,
                'stats': stats_payload,
            }
        )


class UserMatchDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, match_id):
        detail, primary_meta = _load_match_detail_by_id(match_id)

        if not detail:
            return Response(
                {
                    'id': match_id,
                    'stats_loaded_from_detail': False,
                    'stats': {
                        'home': _empty_team_stats(),
                        'away': _empty_team_stats(),
                        'available': False,
                        'message': 'Match details are temporarily unavailable. Please retry shortly.',
                        'providers_attempted': ['football-data.org'],
                    },
                },
                status=status.HTTP_200_OK,
            )

        payload = _match_payload(detail)
        stats_payload, diagnostics = _resolve_match_statistics(detail, match_id, primary_meta=primary_meta)
        payload['stats'] = stats_payload

        if settings.DEBUG or request.query_params.get('debug') == '1':
            payload['stats']['diagnostics'] = diagnostics
        payload['stats_loaded_from_detail'] = True
        logger.info(
            "Match stats debug fixture=%s attempted=%s succeeded=%s final_available=%s primary_url=%s primary_status=%s api_football_url=%s api_football_status=%s primary_home_keys=%s primary_away_keys=%s sportsdb_stats_url=%s sportsdb_status=%s fallback_url=%s fallback_status=%s fallback_row=%s",
            match_id,
            payload['stats'].get('providers_attempted'),
            payload['stats'].get('providers_succeeded'),
            payload['stats'].get('available'),
            primary_meta.get('url'),
            primary_meta.get('status'),
            diagnostics['api_football']['request_url'],
            diagnostics['api_football']['status'],
            diagnostics['football_data_org']['home_statistics_keys'],
            diagnostics['football_data_org']['away_statistics_keys'],
            diagnostics['thesportsdb']['stats_request_url'],
            diagnostics['thesportsdb']['stats_request_status'],
            diagnostics['football_data_uk']['request_url'],
            diagnostics['football_data_uk']['status'],
            diagnostics['football_data_uk']['matched_row'],
            )
        return Response(payload)


class LiveScoresView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        live_statuses = {'LIVE', 'IN_PLAY', 'PAUSED'}
        matches = fetch_pl_matches(limit=None)
        live_matches = [match for match in matches if match.get('status') in live_statuses]
        return Response([_match_payload(match) for match in live_matches])


class MatchDifficultyView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        matches = fetch_pl_matches(limit=None)
        upcoming = [match for match in matches if match.get('status') in {'SCHEDULED', 'TIMED'}]
        return Response([_difficulty_for_match(match) for match in upcoming[:20]])


class TopAttackersView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        scorers = fetch_pl_scorers(limit=30)
        rows = []

        for scorer in scorers:
            player_data = scorer.get('player') or {}
            player_id = player_data.get('id')
            player_name = player_data.get('name')
            goals = scorer.get('goals') or scorer.get('numberOfGoals') or 0
            local_player = None
            if player_id is not None:
                local_player = Player.objects.filter(player_api_id=player_id).first()
            if not local_player and player_name:
                local_player = Player.objects.filter(name__iexact=player_name).first()

            if local_player and not _is_attacker_position(local_player.position):
                continue
            if not player_name and local_player:
                player_name = local_player.name

            if player_name:
                rows.append({'name': player_name, 'goals': int(goals)})
            if len(rows) == 5:
                break

        if len(rows) < 5:
            fallback_players = Player.objects.filter(position__in=['Offence', 'Forward', 'Attacker']).order_by('name')[: 5 - len(rows)]
            used_names = {row['name'] for row in rows}
            for index, player in enumerate(fallback_players):
                if player.name in used_names:
                    continue
                rows.append({'name': player.name, 'goals': max(0, 5 - index)})
                if len(rows) == 5:
                    break

        if not rows:
            rows = [
                {'name': 'Erling Haaland', 'goals': 18},
                {'name': 'Mohamed Salah', 'goals': 16},
                {'name': 'Alexander Isak', 'goals': 14},
                {'name': 'Ollie Watkins', 'goals': 12},
                {'name': 'Bukayo Saka', 'goals': 10},
            ]

        return Response(rows[:5])


class UserTransferMarketView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        team = _ensure_team_defaults(team)
        owned_ids = _owned_player_ids(team.players)
        players = Player.objects.all()
        market = []
        for p in players:
            payload = _player_payload(p)
            if payload.get('is_banned'):
                continue
            market.append({
                'id': p.player_api_id,
                'name': p.name,
                'position': _normalize_position_label(p.position),
                'team': p.team_name,
                'team_api_id': p.team_api_id,
                'value': float(p.cost),
                'is_owned': str(p.player_api_id) in owned_ids,
                'is_banned': False,
            })
        return Response(market)


class UserTransferSubmitView(APIView):
    permission_classes = (IsAuthenticated,)

    def _get_official_cost(self, player_id, fallback_value):
        """Get the official player cost from DB, with a fallback to the stored value."""
        try:
            p = Player.objects.filter(player_api_id=int(player_id)).first()
            if p:
                return Decimal(p.cost)
        except (ValueError, TypeError, Exception):
            pass
        try:
            return Decimal(str(fallback_value or 0))
        except Exception:
            return Decimal('0.00')

    @transaction.atomic
    def post(self, request):
        mode = request.data.get('mode', 'swap')  # 'buy', 'sell', or 'swap'
        out_name = request.data.get('outName')
        out_id = request.data.get('outId')
        in_name = request.data.get('inName')
        player_in_data = request.data.get('playerIn')

        team, _ = UserTeam.objects.get_or_create(user=request.user)
        team = _ensure_team_defaults(team)
        squads = _ensure_squads(team)
        players = _clean_players(team.players)
        selected_players = list(team.selected_players or [])
        players_by_name = {p.get('name'): p for p in players if p is not None}
        players_by_id = {str(p.get('id')): p for p in players if p is not None}
        current_budget = Decimal(team.budget)

        print(f"[Transfer] mode={mode} out={out_name} in={in_name} budget={current_budget}")

        if mode == 'sell':
            if not out_name and out_id is None:
                return Response({'detail': 'A player is required for sell.'}, status=status.HTTP_400_BAD_REQUEST)
            player_out = players_by_id.get(str(out_id)) if out_id is not None else players_by_name.get(out_name)
            if not player_out:
                return Response({'detail': f'"{out_name or out_id}" is not in your owned players.'}, status=status.HTTP_400_BAD_REQUEST)

            sell_value = self._get_official_cost(player_out.get('id'), player_out.get('value', 0))
            print(f"[Transfer] Selling {out_name} refund={sell_value}")
            current_budget += sell_value
            players = [p for p in players if str(p.get('id')) != str(player_out.get('id'))]
            selected_players = [
                None if isinstance(p, dict) and str(p.get('id')) == str(player_out.get('id')) else p
                for p in selected_players
            ]
            for squad in squads:
                squad['selected_players'] = [
                    None if isinstance(p, dict) and str(p.get('id')) == str(player_out.get('id')) else p
                    for p in (squad.get('selected_players') or [])
                ]
            TransferRecord.objects.create(user=request.user, player_out=player_out.get('name', out_name), player_in='(sold)')

        elif mode == 'buy':
            if not in_name or not isinstance(player_in_data, dict):
                return Response({'detail': 'inName and playerIn are required for buy.'}, status=status.HTTP_400_BAD_REQUEST)

            player_in_id = player_in_data.get('id')
            if player_in_id is None:
                return Response({'detail': 'Player id is required for buy.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(players) >= MAX_OWNED_PLAYERS:
                return Response({'detail': 'You can only own a maximum of 15 players.'}, status=status.HTTP_400_BAD_REQUEST)
            if str(player_in_id) in players_by_id:
                return Response({'detail': f'"{in_name}" is already owned.'}, status=status.HTTP_400_BAD_REQUEST)

            buy_cost = self._get_official_cost(player_in_data.get('id'), player_in_data.get('value', 0))
            print(f"[Transfer] Buying {in_name} cost={buy_cost} budget={current_budget}")

            if current_budget < buy_cost:
                return Response(
                    {'detail': 'Insufficient funds'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            current_budget -= buy_cost
            player_obj = Player.objects.filter(player_api_id=player_in_id).first()
            if player_obj and _player_payload(player_obj).get('is_banned'):
                return Response({'detail': f'"{player_obj.name}" is currently banned and unavailable.'}, status=status.HTTP_400_BAD_REQUEST)
            new_player = {
                'id': player_in_id,
                'name': player_obj.name if player_obj else in_name,
                'position': player_obj.position if player_obj else player_in_data.get('position', 'FWD'),
                'team': player_obj.team_name if player_obj else player_in_data.get('team', ''),
                'team_api_id': player_obj.team_api_id if player_obj else player_in_data.get('team_api_id'),
                'value': float(buy_cost),
                'added_at': timezone.now().isoformat(),
            }
            players.append(new_player)
            TransferRecord.objects.create(user=request.user, player_out='(bought)', player_in=new_player['name'])

        elif mode == 'swap':
            if not out_name or not in_name or not isinstance(player_in_data, dict):
                return Response({'detail': 'outName, inName, and playerIn are required for swap.'}, status=status.HTTP_400_BAD_REQUEST)
            player_in_id = player_in_data.get('id')
            if str(player_in_id) in players_by_id:
                return Response({'detail': f'"{in_name}" is already owned.'}, status=status.HTTP_400_BAD_REQUEST)
            if out_name not in players_by_name:
                return Response({'detail': f'"{out_name}" is not in your team.'}, status=status.HTTP_400_BAD_REQUEST)

            player_out = players_by_name[out_name]
            sell_value = self._get_official_cost(player_out.get('id'), player_out.get('value', 0))
            buy_cost = self._get_official_cost(player_in_data.get('id'), player_in_data.get('value', 0))
            net = sell_value - buy_cost
            print(f"[Transfer] Swap sell={sell_value} buy={buy_cost} net={net}")

            if current_budget + net < 0:
                return Response(
                    {'detail': 'Insufficient funds'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            current_budget += net
            player_obj = Player.objects.filter(player_api_id=player_in_id).first()
            if player_obj and _player_payload(player_obj).get('is_banned'):
                return Response({'detail': f'"{player_obj.name}" is currently banned and unavailable.'}, status=status.HTTP_400_BAD_REQUEST)
            new_player = {
                'id': player_in_id,
                'name': player_obj.name if player_obj else in_name,
                'position': player_obj.position if player_obj else player_in_data.get('position', 'FWD'),
                'team': player_obj.team_name if player_obj else player_in_data.get('team', ''),
                'team_api_id': player_obj.team_api_id if player_obj else player_in_data.get('team_api_id'),
                'value': float(buy_cost),
                'added_at': timezone.now().isoformat(),
            }
            # Replace in slot
            for i, p in enumerate(players):
                if p and p.get('name') == out_name:
                    players[i] = new_player
                    break
            selected_players = [
                new_player if isinstance(p, dict) and p.get('name') == out_name else p
                for p in selected_players
            ]
            for squad in squads:
                squad['selected_players'] = [
                    new_player if isinstance(p, dict) and p.get('name') == out_name else p
                    for p in (squad.get('selected_players') or [])
                ]
            TransferRecord.objects.create(user=request.user, player_out=out_name, player_in=in_name)

        else:
            return Response({'detail': f'Unknown mode: {mode}'}, status=status.HTTP_400_BAD_REQUEST)

        team.players = players
        team.budget = current_budget
        team.selected_players = selected_players
        team.squads = squads
        team.save(update_fields=['players', 'selected_players', 'squads', 'budget'])
        print(f"[Transfer] Done. budget={current_budget} players={len(team.players)}")

        return Response({
            'message': 'Transfer completed successfully.',
            'budget': float(team.budget),
            'team': team.players,
            'owned_players': team.players,
            'selected_players': team.selected_players,
            'owned_count': len(_clean_players(team.players)),
            'max_players': MAX_OWNED_PLAYERS,
        })


class TransferHistoryView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        records = TransferRecord.objects.filter(user=request.user).order_by('-created_at')[:50]
        return Response([
            {
                'id': str(record.pk),
                'player_out': record.player_out,
                'player_in': record.player_in,
                'created_at': record.created_at.isoformat(),
            }
            for record in records
        ])


class AdminTransfersView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        records = TransferRecord.objects.select_related('user').order_by('-created_at')[:200]
        return Response([
            {
                'id': str(record.pk),
                'user': record.user.username,
                'email': record.user.email,
                'player_out': record.player_out,
                'player_in': record.player_in,
                'created_at': record.created_at.isoformat(),
            }
            for record in records
        ])


class WatchlistView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        _ensure_watchlist_state(team)
        finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
        return Response(_watchlist_payload(team, finished_matches))

    def post(self, request):
        player_id = request.data.get('id')
        if player_id is None:
            return Response({'detail': 'Player id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        team, _ = UserTeam.objects.get_or_create(user=request.user)
        watchlist = _ensure_watchlist_state(team)
        if any(str(item.get('id')) == str(player_id) for item in watchlist):
            return Response(
                {'detail': 'Player is already in your watchlist.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(watchlist) >= MAX_WATCHLIST_PLAYERS:
            return Response(
                {'detail': 'You can only watchlist 2 players at a time.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player = _player_by_api_id(player_id)
        request_payload = {
            'id': player_id,
            'name': request.data.get('name', 'Unknown player'),
            'position': request.data.get('position', ''),
            'team': request.data.get('team', ''),
            'team_api_id': request.data.get('team_api_id'),
            'value': request.data.get('value', 0),
        }
        payload = _watchlist_base_payload(request_payload, player)

        watchlist.append(payload)
        team.watchlist = watchlist
        team.save(update_fields=['watchlist'])
        return Response(_watchlist_payload(team))

    def delete(self, request):
        player_id = request.data.get('id') or request.query_params.get('id')
        if player_id is None:
            return Response({'detail': 'Player id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        team.watchlist = [item for item in _clean_watchlist_items(team.watchlist) if str(item.get('id')) != str(player_id)]
        team.save(update_fields=['watchlist'])
        return Response(_watchlist_payload(team))


class WatchlistRecentMatchesView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, player_id):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        watchlist = _ensure_watchlist_state(team)
        if not any(str(item.get('id')) == str(player_id) for item in watchlist):
            return Response({'detail': 'Player is not in your watchlist.'}, status=status.HTTP_404_NOT_FOUND)

        player = _player_by_api_id(player_id)
        if not player:
            return Response({'detail': 'Player not found.'}, status=status.HTTP_404_NOT_FOUND)

        finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
        return Response(_recent_player_performance(player, finished_matches, limit=3))


class WatchlistPlayerDetailsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, player_id):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        watchlist = _ensure_watchlist_state(team)
        item = next((entry for entry in watchlist if str(entry.get('id')) == str(player_id)), None)
        if not item:
            return Response({'detail': 'Player is not in your watchlist.'}, status=status.HTTP_404_NOT_FOUND)

        player = _player_by_watchlist_item(item)
        finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
        payload = _watchlist_base_payload(item, player)
        season_stats = _player_season_stats(player, finished_matches) if player else {
            'goals': _first_safe_number(item, 'goals', ('statistics', 'goals', 'total'), ('goals', 'total'), ('playerStats', 'goals'), ('player', 'goals'), ('seasonStats', 'goals')),
            'assists': _first_safe_number(item, 'assists', ('statistics', 'goals', 'assists'), ('goals', 'assists')),
            'matches_played': _first_safe_number(item, 'matches_played', ('games', 'appearences'), ('games', 'appearances')),
            'minutes': _first_safe_number(item, 'minutes', ('games', 'minutes')),
            'rating': _first_safe_number(item, 'rating', ('games', 'rating')),
        }
        payload['season_stats'] = season_stats
        payload['goals'] = season_stats.get('goals')
        payload['assists'] = season_stats.get('assists')
        payload['matches_played'] = season_stats.get('matches_played')
        payload['recent_performance'] = _recent_player_performance(player, finished_matches, limit=3) if player else []
        payload['performance_available'] = any(entry.get('data_available') for entry in payload['recent_performance'])
        return Response(payload)


class NotificationsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        matches = fetch_pl_matches(limit=None)
        notifications = _ensure_user_notifications(team, matches)
        if not notifications:
            notifications = [
                {
                    'id': 'welcome',
                    'key': 'welcome',
                    'type': 'info',
                    'message': 'Build your squad and sync points after completed matchweeks.',
                    'created_at': timezone.now().isoformat(),
                    'read': False,
                    'email_sent': False,
                }
            ]
            team.notifications = notifications
            team.save(update_fields=['notifications'])
        return Response(notifications)

    def post(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        notifications = list(team.notifications or [])
        action = request.data.get('action')

        if action in {'mark_read', 'mark_all_read'}:
            notification_id = request.data.get('id')
            for item in notifications:
                if action == 'mark_all_read' or str(item.get('id')) == str(notification_id):
                    item['read'] = True
                    item['read_at'] = timezone.now().isoformat()
            team.notifications = notifications
            team.save(update_fields=['notifications'])
            return Response(sorted(team.notifications or [], key=_notification_sort_key, reverse=True))

        notification = {
            'id': request.data.get('id') or f"alert-{timezone.now().timestamp()}",
            'key': request.data.get('key') or request.data.get('id') or f"alert-{timezone.now().timestamp()}",
            'type': request.data.get('type', 'info'),
            'message': request.data.get('message', 'New alert'),
            'created_at': timezone.now().isoformat(),
            'read': bool(request.data.get('read', False)),
            'email_sent': False,
            'email_queued': False,
        }
        notifications.append(notification)
        team.notifications = sorted(notifications[-60:], key=_notification_sort_key, reverse=True)
        if not request.data.get('read', False):
            _queue_notification_email(team, notification)
        team.save(update_fields=['notifications'])
        return Response(team.notifications)


class AnalyticsSummaryView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        team = _ensure_team_defaults(team)
        squad = _lineup_for_points(team)
        owned = _clean_players(team.players)
        by_position = {}
        for player in squad:
            position = player.get('position') or 'Unknown'
            by_position[position] = by_position.get(position, 0) + 1

        return Response({
            'points': team.points,
            'rank': team.rank,
            'budget': float(team.budget),
            'team_size': len(squad),
            'owned_count': len(owned),
            'watchlist_count': len(team.watchlist or []),
            'rewards': team.rewards or [],
            'position_breakdown': by_position,
            'points_history': [
                {'week': f"MW {week}", 'points': int((team.weekly_points or {}).get(str(week), 0))}
                for week in sorted([int(key) for key in (team.weekly_points or {}).keys() if str(key).isdigit()])[-6:]
            ],
        })


class ProfileUpdateView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request):
        user = request.user
        username = request.data.get('username')
        email = request.data.get('email')

        if username:
            user.username = username
        if email:
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                return Response({'detail': 'Email already in use.'}, status=status.HTTP_400_BAD_REQUEST)
            user.email = email.lower()
        
        user.save()
        return Response({
            'user': _user_payload(user, request)
        })


class ProfilePictureUploadView(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        image = request.FILES.get('profile_picture') or request.FILES.get('image')
        if not image:
            return Response({'detail': 'Profile picture file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(image.name or '')[1].lower()
        content_type = getattr(image, 'content_type', '')
        if content_type not in PROFILE_IMAGE_TYPES or ext not in PROFILE_IMAGE_EXTENSIONS:
            return Response({'detail': 'Only JPG, JPEG, PNG, and WEBP images are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        if image.size > PROFILE_IMAGE_MAX_BYTES:
            return Response({'detail': 'Profile picture must be 2MB or smaller.'}, status=status.HTTP_400_BAD_REQUEST)

        storage = FileSystemStorage(location=settings.MEDIA_ROOT / 'profile_pictures')
        filename = storage.save(f"{request.user.pk}_{uuid.uuid4().hex}{ext}", image)
        request.user.profile_picture = f"{settings.MEDIA_URL}profile_pictures/{filename}"
        request.user.save(update_fields=['profile_picture'])
        return Response({
            'detail': 'Profile picture updated.',
            'user': _user_payload(request.user, request),
            'profile_picture': _profile_picture_url(request.user, request),
        })

class ChangePasswordView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        current_password = request.data.get('currentPassword')
        new_password = request.data.get('newPassword')

        if not current_password or not new_password:
            return Response({'detail': 'Both current and new passwords are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.check_password(current_password):
            return Response({'detail': 'Incorrect current password.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({'detail': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({'detail': 'Password updated successfully.'})


class PasswordResetRequestView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        reset_token = None
        if user:
            reset_token = signing.dumps({'user_id': str(user.pk), 'email': user.email})
            try:
                send_mail(
                    'Fantasy Football password reset',
                    (
                        'Use this password reset token in the app. '
                        f'This token expires in 30 minutes: {reset_token}'
                    ),
                    settings.EMAIL_HOST_USER,
                    [user.email],
                    fail_silently=False,
                )
            except Exception as e:
                print(f"!!! PASSWORD RESET EMAIL FAILED for {email}: {e}")
                print(f"\n[PASSWORD RESET TOKEN FOR {email}]: {reset_token}\n")

        payload = {'detail': 'If an account exists for that email, a reset token has been sent.'}
        if settings.DEBUG and reset_token:
            payload['reset_token'] = reset_token
        return Response(payload)


class PasswordResetConfirmView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        token = request.data.get('token')
        new_password = request.data.get('newPassword') or request.data.get('new_password')

        if not token or not new_password:
            return Response({'detail': 'Token and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            data = signing.loads(token, max_age=1800)
            user = User.objects.get(pk=data.get('user_id'), email__iexact=data.get('email'), is_active=True)
            validate_password(new_password, user=user)
        except signing.SignatureExpired:
            return Response({'detail': 'Password reset token has expired.'}, status=status.HTTP_400_BAD_REQUEST)
        except (signing.BadSignature, User.DoesNotExist):
            return Response({'detail': 'Invalid password reset token.'}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({'detail': 'Password reset successfully. You can now log in.'})


class LeaderboardView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
            teams = list(UserTeam.objects.select_related('user').filter(user__is_staff=False))
            for team in teams:
                _reconcile_team_points(team, finished_matches=finished_matches)
            update_rankings_and_rewards()
            teams.sort(key=lambda team: team.points, reverse=True)
            leaderboard = []
            for i, team in enumerate(teams):
                rank = i + 1
                leaderboard.append({
                    'rank': rank,
                    'username': team.user.username,
                    'points': team.points,
                    'reward': float(_reward_for_rank(rank)),
                    'budget': float(team.budget),
                    'rewards': team.rewards or [],
                    'is_me': team.user == request.user
                })
            return Response(leaderboard)
        except Exception as e:
            import traceback
            print(f"ERROR in LeaderboardView: {e}")
            print(traceback.format_exc())
            return Response({'detail': f"Backend Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WeeklyLeaderboardView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
            teams = list(UserTeam.objects.select_related('user').filter(user__is_staff=False))
            for team in teams:
                _reconcile_team_points(team, finished_matches=finished_matches)
            matchweek = request.query_params.get('matchweek')
            if matchweek is None:
                weeks = []
                for team in teams:
                    weeks.extend(int(key) for key in (team.weekly_points or {}).keys() if str(key).isdigit())
                matchweek = max(weeks) if weeks else None
            else:
                matchweek = int(matchweek)

            if matchweek is not None:
                update_rankings_and_rewards(matchweek=matchweek)

            week_key = str(matchweek) if matchweek is not None else None
            teams.sort(key=lambda team: int((team.weekly_points or {}).get(week_key, 0)) if week_key else 0, reverse=True)

            rows = []
            for i, team in enumerate(teams):
                rank = i + 1
                weekly_points = int((team.weekly_points or {}).get(week_key, 0)) if week_key else 0
                rows.append({
                    'rank': rank,
                    'matchweek': matchweek,
                    'username': team.user.username,
                    'points': weekly_points,
                    'weekly_points': weekly_points,
                    'reward': float(_reward_for_rank(rank)),
                    'budget': float(team.budget),
                    'is_me': team.user == request.user,
                })
            return Response(rows)
        except Exception as e:
            import traceback
            print(f"ERROR in WeeklyLeaderboardView: {e}")
            print(traceback.format_exc())
            return Response({'detail': f"Backend Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _record_key(record):
    if isinstance(record, dict):
        key = record.get('key')
        if not key:
            return None
        if key.startswith('real:') or key.startswith('simulation:'):
            return key.split(':', 1)[1]
        return key
    return str(record) if record else None


def _result_for_team(match, team_api_id):
    home = match.get('homeTeam') or {}
    away = match.get('awayTeam') or {}
    home_id = home.get('id')
    away_id = away.get('id')
    score = (match.get('score') or {}).get('fullTime') or {}
    home_score = score.get('home')
    away_score = score.get('away')
    if team_api_id not in (home_id, away_id) or home_score is None or away_score is None:
        return None

    is_home = team_api_id == home_id
    team_name = (home if is_home else away).get('shortName') or (home if is_home else away).get('name')
    if home_score == away_score:
        return {'points': 1, 'label': 'drew', 'team_name': team_name}
    won = home_score > away_score if is_home else away_score > home_score
    return {'points': 3 if won else 0, 'label': 'won' if won else 'lost', 'team_name': team_name}


def _calculate_points_from_matches(team, matches, source='real', require_ownership=True, require_registration=True):
    players = _lineup_for_points(team)
    if not players:
        return {'new_points': 0, 'matchweeks': [], 'processed': 0}

    processed_records = list(team.processed_match_results or [])
    processed_keys = {_record_key(record) for record in processed_records}
    new_points = 0
    processed_count = 0
    processed_weeks = set()
    registration_at = _coerce_datetime(team.user.date_joined)
    ownership_intervals = _ownership_intervals_for_team(team)

    for match in matches:
        if match.get('status') != 'FINISHED':
            continue
        match_id = match.get('id')
        matchweek = match.get('matchday')
        kickoff = _match_kickoff(match)
        if not match_id or not matchweek:
            continue
        if require_registration and registration_at and kickoff and kickoff < registration_at:
            continue

        for player in players:
            if not isinstance(player, dict) or player.get('id') is None:
                continue

            player_obj = Player.objects.filter(player_api_id=player.get('id')).first()
            player_name = player_obj.name if player_obj else player.get('name', 'Player')
            if require_ownership and not _player_owned_at_kickoff(team, player_name, kickoff, ownership_intervals):
                continue

            team_api_id = player_obj.team_api_id if player_obj else player.get('team_api_id')
            if not team_api_id:
                continue

            result = _result_for_team(match, team_api_id)
            if result is None:
                continue

            key = f"match:{match_id}:player:{player.get('id')}"
            if key in processed_keys:
                continue

            points = int(result['points'])
            new_points += points
            processed_count += 1
            processed_weeks.add(matchweek)
            processed_keys.add(key)
            processed_records.append({
                'key': key,
                'source': source,
                'match_id': match_id,
                'matchweek': matchweek,
                'player_id': player.get('id'),
                'player_name': player_obj.name if player_obj else player.get('name', 'Player'),
                'team_api_id': team_api_id,
                'points': points,
                'created_at': timezone.now().isoformat(),
            })

            team_name = result.get('team_name') or player.get('team') or 'Team'
            _append_notification_once(
                team,
                f"points:{source}:{key}",
                f"{team_name} {result['label']}. {player_name} earned {points} points.",
                'points',
                email_subject='Fantasy points update',
            )

    if processed_count:
        team.processed_match_results = processed_records[-1000:]
        team.save(update_fields=[
            'processed_match_results',
            'notifications',
        ])

    _reconcile_team_points(team, finished_matches=matches)

    return {'new_points': int(new_points), 'matchweeks': sorted(processed_weeks), 'processed': processed_count}


def _reset_simulation_points(team):
    records = list(team.processed_match_results or [])
    simulation_records = [record for record in records if isinstance(record, dict) and record.get('source') == 'simulation']
    if not simulation_records:
        return 0

    weekly_points = dict(team.weekly_points or {})
    removed_points = 0
    simulation_weeks = set()
    for record in simulation_records:
        points = int(record.get('points') or 0)
        week_key = str(record.get('matchweek'))
        simulation_weeks.add(record.get('matchweek'))
        removed_points += points
        weekly_points[week_key] = max(0, int(weekly_points.get(week_key, 0)) - points)
        if weekly_points[week_key] == 0:
            weekly_points.pop(week_key, None)

    simulation_rewards = [
        reward for reward in list(team.rewards or [])
        if isinstance(reward, dict) and reward.get('source') == 'simulation' and reward.get('matchweek') in simulation_weeks
    ]
    removed_reward = sum(Decimal(str(reward.get('reward') or 0)) for reward in simulation_rewards)

    team.points = max(0, int(team.points or 0) - removed_points)
    team.budget = max(Decimal('0.00'), Decimal(team.budget) - removed_reward)
    team.weekly_points = weekly_points
    team.rewards = [
        reward for reward in list(team.rewards or [])
        if not (isinstance(reward, dict) and reward.get('source') == 'simulation' and reward.get('matchweek') in simulation_weeks)
    ]
    team.processed_match_results = [
        record for record in records
        if not (isinstance(record, dict) and record.get('source') == 'simulation')
    ]
    team.notifications = [
        item for item in list(team.notifications or [])
        if not (isinstance(item, dict) and str(item.get('key') or item.get('id') or '').startswith('points:simulation:'))
    ]
    team.last_synced_at = timezone.now()
    team.save(update_fields=['points', 'budget', 'weekly_points', 'processed_match_results', 'rewards', 'notifications', 'last_synced_at'])
    update_rankings_and_rewards()
    return removed_points


def _points_sync_due(team, force=False):
    if force:
        return True
    interval = int(getattr(settings, 'POINT_SYNC_INTERVAL_SECONDS', 900))
    if not team.last_synced_at:
        return True
    return timezone.now() - team.last_synced_at >= timedelta(seconds=interval)


def sync_user_points(user, initial=False, force=False):
    """Sync finished match points for selected players without duplicate awards."""
    lock_acquired = False
    try:
        team, _ = UserTeam.objects.get_or_create(user=user)
        if not _points_sync_due(team, force=force or initial):
            return 0

        lock_key = f"points-sync-lock:{user.pk}"
        if not cache.add(lock_key, True, timeout=60):
            logger.info("Skipping concurrent point sync for user %s", user.pk)
            return 0
        lock_acquired = True

        finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
        if not finished_matches:
            team.last_synced_at = timezone.now()
            team.save(update_fields=['last_synced_at'])
            return 0

        if initial and not team.processed_match_results:
            finished_days = sorted({m.get('matchday') for m in finished_matches if m.get('matchday')}, reverse=True)
            allowed_days = set(finished_days[:2])
            finished_matches = [m for m in finished_matches if m.get('matchday') in allowed_days]

        result = _calculate_points_from_matches(team, finished_matches, source='real')
        return result['new_points']
    except Exception as e:
        logger.exception("Error syncing points for %s: %s", user.email, e)
        return 0
    finally:
        if lock_acquired:
            cache.delete(f"points-sync-lock:{user.pk}")


class SyncPointsView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        initial = request.data.get('initial', False)
        force = bool(request.data.get('force', False))
        new_points = sync_user_points(request.user, initial=initial, force=force)
        
        team = UserTeam.objects.get(user=request.user)
        return Response({
            'detail': 'Points synchronized successfully.',
            'new_points': new_points,
            'total_points': team.points,
            'processed_matchweeks': team.processed_matchweeks,
            'processed_match_results': team.processed_match_results or [],
            'weekly_points': team.weekly_points,
            'budget': float(team.budget),
            'rewards': team.rewards or [],
        })


class SimulateLastMatchweekView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        team, _ = UserTeam.objects.get_or_create(user=request.user)
        if request.data.get('reset'):
            removed_points = _reset_simulation_points(team)
            if not request.data.get('recalculate', False):
                return Response({
                    'detail': 'Simulation points reset.',
                    'removed_points': removed_points,
                    'total_points': team.points,
                    'weekly_points': team.weekly_points,
                })

        finished_matches = fetch_pl_matches(limit=500, status='FINISHED')
        if not finished_matches:
            return Response({'detail': 'No completed matchweek is available for simulation.'}, status=status.HTTP_400_BAD_REQUEST)

        eligible_matches = [
            match
            for match in finished_matches
            if _match_has_eligible_points(
                team,
                match,
                require_ownership=False,
                require_registration=False,
            )
        ]
        latest_matchweek = max((m.get('matchday') for m in eligible_matches if m.get('matchday')), default=None)

        if latest_matchweek is None:
            return Response(
                {'detail': 'No completed matches found for the players in your current squad.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        latest_matches = [match for match in eligible_matches if match.get('matchday') == latest_matchweek]
        result = _calculate_points_from_matches(
            team,
            latest_matches,
            source='simulation',
            require_ownership=False,
            require_registration=False,
        )
        team.refresh_from_db()
        message = (
            f"Simulated matchweek {latest_matchweek}. Awarded {result['new_points']} points."
            if result['processed']
            else f"Matchweek {latest_matchweek} was already simulated for this squad."
        )
        return Response({
            'detail': message,
            'matchweek': latest_matchweek,
            'new_points': result['new_points'],
            'processed': result['processed'],
            'total_points': team.points,
            'weekly_points': team.weekly_points,
            'budget': float(team.budget),
            'rewards': team.rewards or [],
            'notifications': team.notifications or [],
        })
