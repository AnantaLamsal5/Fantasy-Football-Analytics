import json
import logging
import csv
from datetime import datetime
from io import StringIO
from urllib import parse, request
from urllib.error import HTTPError, URLError

# pyrefly: ignore [missing-import]
from django.conf import settings
from django.core.cache import cache


BASE_URL = 'https://api.football-data.org/v4'
THESPORTSDB_BASE_URL = 'https://www.thesportsdb.com/api/v1/json'
logger = logging.getLogger(__name__)


def _headers():
    return {'X-Auth-Token': settings.FOOTBALL_DATA_API_KEY}


def _cache_key(path, query=None):
    query = query or {}
    encoded = parse.urlencode(sorted(query.items()))
    return f"football-data:{path}:{encoded}"


def _payload_excerpt(payload, max_chars=1500):
    if not payload:
        return ''
    payload = payload.replace('\n', ' ').replace('\r', ' ')
    return payload[:max_chars]


def fetch_json(path, query=None, cache_timeout=None, return_meta=False):
    query = query or {}
    cache_timeout = cache_timeout or int(getattr(settings, 'FOOTBALL_DATA_CACHE_SECONDS', 120))
    key = _cache_key(path, query)
    stale_key = f"{key}:stale"
    cached = cache.get(key)
    url = f'{BASE_URL}{path}'
    if query:
        url = f'{url}?{parse.urlencode(query)}'

    if cached is not None:
        meta = {'url': url, 'status': 'cache_hit', 'cache_hit': True, 'source': 'football-data.org'}
        return (cached, meta) if return_meta else cached

    req = request.Request(url, headers=_headers())
    meta = {'url': url, 'status': None, 'cache_hit': False, 'source': 'football-data.org'}
    try:
        payload = ''
        for attempt in range(2):
            meta['attempt'] = attempt + 1
            try:
                with request.urlopen(req, timeout=10) as response:
                    meta['status'] = response.status
                    payload = response.read().decode('utf-8')
                break
            except URLError:
                if attempt == 1:
                    raise
        if not payload:
            meta['payload_excerpt'] = ''
            return ({}, meta) if return_meta else {}
        data = json.loads(payload)
        meta['payload_keys'] = list(data.keys())[:20] if isinstance(data, dict) else []
        meta['payload_excerpt'] = _payload_excerpt(payload)
        logger.info(
            "FOOTBALL-DATA request url=%s status=%s keys=%s",
            url,
            meta['status'],
            meta.get('payload_keys'),
        )
        logger.debug("FOOTBALL-DATA payload url=%s excerpt=%s", url, meta['payload_excerpt'])
        cache.set(key, data, cache_timeout)
        cache.set(stale_key, data, 24 * 60 * 60)
        return (data, meta) if return_meta else data
    except json.JSONDecodeError:
        meta['error'] = 'invalid_json'
        logger.warning("FOOTBALL-DATA API invalid JSON response from %s", url)
    except HTTPError as e:
        meta['status'] = e.code
        error_payload = ''
        try:
            error_payload = e.read().decode('utf-8')
        except Exception:
            error_payload = ''
        meta['payload_excerpt'] = _payload_excerpt(error_payload)
        if e.code == 429:
            logger.warning("FOOTBALL-DATA API rate limit (429) for %s", url)
        elif e.code == 403:
            logger.warning("FOOTBALL-DATA API forbidden (403) for %s", url)
        else:
            logger.warning("FOOTBALL-DATA API HTTP error %s: %s for %s", e.code, e.reason, url)
    except URLError as e:
        meta['error'] = str(e.reason)
        logger.warning("FOOTBALL-DATA API network error: %s for %s", e.reason, url)
    except Exception as e:
        meta['error'] = str(e)
        logger.exception("FOOTBALL-DATA API unexpected error fetching %s: %s", url, e)

    stale = cache.get(stale_key)
    if stale is not None:
        meta['status'] = meta.get('status') or 'stale_cache'
        meta['stale_cache'] = True
        logger.info("Using stale football-data cache for %s", url)
        return (stale, meta) if return_meta else stale
    return ({}, meta) if return_meta else {}


def fetch_pl_matches(limit=20, status=None):
    query = {}
    if status:
        query['status'] = status
    data = fetch_json('/competitions/PL/matches', query, cache_timeout=120)
    matches = data.get('matches', [])
    if limit is None:
        return matches
    return matches[:limit]


def fetch_match(match_id, return_meta=False):
    if not match_id:
        return ({}, {'error': 'missing_match_id'}) if return_meta else {}
    return fetch_json(
        f'/matches/{match_id}',
        cache_timeout=int(getattr(settings, 'MATCH_STATS_CACHE_SECONDS', 6 * 60 * 60)),
        return_meta=return_meta,
    )


def _season_code(start_date):
    if not start_date:
        now = datetime.utcnow()
        start_year = now.year if now.month >= 7 else now.year - 1
    else:
        start_year = int(str(start_date)[:4])
    return f"{str(start_year)[-2:]}{str(start_year + 1)[-2:]}"


def _normalize_team_name(name):
    value = str(name or '').lower()
    replacements = {
        '&': 'and',
        '.': '',
        "'": '',
        '-': ' ',
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    stop_words = {'fc', 'afc', 'the'}
    return ' '.join(token for token in value.split() if token not in stop_words).strip()


TEAM_ALIASES = {
    'man city': 'manchester city',
    'manchester city': 'manchester city',
    'man united': 'manchester united',
    'man utd': 'manchester united',
    'manchester united': 'manchester united',
    'newcastle': 'newcastle united',
    'newcastle united': 'newcastle united',
    'spurs': 'tottenham',
    'tottenham hotspur': 'tottenham',
    'tottenham': 'tottenham',
    'nottm forest': 'nottingham forest',
    'nottingham forest': 'nottingham forest',
    'wolves': 'wolves',
    'wolverhampton wanderers': 'wolves',
    'brighton hove albion': 'brighton',
    'brighton': 'brighton',
    'west ham': 'west ham united',
    'west ham united': 'west ham united',
    'leeds': 'leeds united',
    'leeds united': 'leeds united',
    'leicester': 'leicester city',
    'leicester city': 'leicester city',
    'ipswich': 'ipswich town',
    'ipswich town': 'ipswich town',
    'sheffield utd': 'sheffield united',
    'sheffield united': 'sheffield united',
}


def canonical_team_name(name):
    normalized = _normalize_team_name(name)
    return TEAM_ALIASES.get(normalized, normalized)


def _football_data_uk_url(season_code):
    return f"https://www.football-data.co.uk/mmz4281/{season_code}/E0.csv"


def fetch_pl_result_stats(season_start=None, return_meta=False):
    season_code = _season_code(season_start)
    url = _football_data_uk_url(season_code)
    key = f"football-data-uk:E0:{season_code}"
    stale_key = f"{key}:stale"
    cached = cache.get(key)
    meta = {'url': url, 'status': None, 'cache_hit': False, 'source': 'football-data.co.uk', 'season_code': season_code}
    if cached is not None:
        meta['status'] = 'cache_hit'
        meta['cache_hit'] = True
        return (cached, meta) if return_meta else cached

    req = request.Request(url, headers={'User-Agent': 'FantasyFootballAnalytics/1.0'})
    try:
        payload = ''
        for attempt in range(2):
            meta['attempt'] = attempt + 1
            try:
                with request.urlopen(req, timeout=10) as response:
                    meta['status'] = response.status
                    payload = response.read().decode('utf-8-sig')
                break
            except URLError:
                if attempt == 1:
                    raise
        reader = csv.DictReader(StringIO(payload))
        rows = [row for row in reader if row.get('HomeTeam') and row.get('AwayTeam')]
        meta['row_count'] = len(rows)
        meta['payload_excerpt'] = _payload_excerpt(payload)
        logger.info("FOOTBALL-DATA-UK request url=%s status=%s rows=%s", url, meta['status'], len(rows))
        logger.debug("FOOTBALL-DATA-UK payload url=%s excerpt=%s", url, meta['payload_excerpt'])
        cache.set(key, rows, 12 * 60 * 60)
        cache.set(stale_key, rows, 7 * 24 * 60 * 60)
        return (rows, meta) if return_meta else rows
    except HTTPError as e:
        meta['status'] = e.code
        try:
            meta['payload_excerpt'] = _payload_excerpt(e.read().decode('utf-8'))
        except Exception:
            meta['payload_excerpt'] = ''
        logger.warning("FOOTBALL-DATA-UK HTTP error %s for %s", e.code, url)
    except Exception as e:
        meta['error'] = str(e)
        logger.warning("FOOTBALL-DATA-UK error fetching %s: %s", url, e)

    stale = cache.get(stale_key)
    if stale is not None:
        meta['stale_cache'] = True
        logger.info("Using stale football-data.co.uk cache for %s", url)
        return (stale, meta) if return_meta else stale
    return ([], meta) if return_meta else []


def _fetch_external_json(url, cache_key, cache_timeout, source):
    stale_key = f"{cache_key}:stale"
    cached = cache.get(cache_key)
    meta = {'url': url, 'status': None, 'cache_hit': False, 'source': source}
    if cached is not None:
        meta['status'] = 'cache_hit'
        meta['cache_hit'] = True
        return cached, meta

    req = request.Request(url, headers={'User-Agent': 'FantasyFootballAnalytics/1.0'})
    try:
        payload = ''
        for attempt in range(2):
            meta['attempt'] = attempt + 1
            try:
                with request.urlopen(req, timeout=10) as response:
                    meta['status'] = response.status
                    payload = response.read().decode('utf-8')
                break
            except URLError:
                if attempt == 1:
                    raise
        data = json.loads(payload) if payload else {}
        meta['payload_keys'] = list(data.keys())[:20] if isinstance(data, dict) else []
        meta['payload_excerpt'] = _payload_excerpt(payload)
        cache.set(cache_key, data, cache_timeout)
        cache.set(stale_key, data, 24 * 60 * 60)
        logger.info("%s request url=%s status=%s keys=%s", source, url, meta['status'], meta.get('payload_keys'))
        logger.debug("%s payload url=%s excerpt=%s", source, url, meta['payload_excerpt'])
        return data, meta
    except HTTPError as e:
        meta['status'] = e.code
        try:
            meta['payload_excerpt'] = _payload_excerpt(e.read().decode('utf-8'))
        except Exception:
            meta['payload_excerpt'] = ''
        logger.warning("%s HTTP error %s for %s", source, e.code, url)
    except Exception as e:
        meta['error'] = str(e)
        logger.warning("%s error fetching %s: %s", source, url, e)

    stale = cache.get(stale_key)
    if stale is not None:
        meta['stale_cache'] = True
        return stale, meta
    return {}, meta


def _sportsdb_key():
    return getattr(settings, 'THESPORTSDB_API_KEY', '123') or '123'


def _sportsdb_url(endpoint, query):
    return f"{THESPORTSDB_BASE_URL}/{_sportsdb_key()}/{endpoint}?{parse.urlencode(query)}"


def _sportsdb_event_filename(match):
    kickoff = match.get('utcDate') or match.get('kickoff')
    date_part = str(kickoff)[:10] if kickoff else ''
    home = (match.get('homeTeam') or {}).get('name') or (match.get('homeTeam') or {}).get('shortName') or ''
    away = (match.get('awayTeam') or {}).get('name') or (match.get('awayTeam') or {}).get('shortName') or ''
    def clean(value):
        return '_'.join(str(value).replace('&', 'and').replace('.', '').split())
    return f"English_Premier_League_{date_part}_{clean(home)}_vs_{clean(away)}"


def _sportsdb_event_matches(match, event):
    home = canonical_team_name((match.get('homeTeam') or {}).get('name') or (match.get('homeTeam') or {}).get('shortName'))
    away = canonical_team_name((match.get('awayTeam') or {}).get('name') or (match.get('awayTeam') or {}).get('shortName'))
    event_home = canonical_team_name(event.get('strHomeTeam'))
    event_away = canonical_team_name(event.get('strAwayTeam'))
    if home != event_home or away != event_away:
        return False
    kickoff = match.get('utcDate') or match.get('kickoff') or ''
    if event.get('dateEvent') and kickoff:
        return str(kickoff)[:10] == str(event.get('dateEvent'))[:10]
    return True


def _sportsdb_find_event(match):
    filename = _sportsdb_event_filename(match)
    cache_timeout = int(getattr(settings, 'THESPORTSDB_CACHE_SECONDS', 6 * 60 * 60))
    url = _sportsdb_url('searchfilename.php', {'e': filename})
    data, meta = _fetch_external_json(
        url,
        f"thesportsdb:searchfilename:{filename}",
        cache_timeout,
        'TheSportsDB',
    )
    events = data.get('event') or data.get('events') or []
    if isinstance(events, dict):
        events = [events]
    matched = next((event for event in events if _sportsdb_event_matches(match, event)), None)
    if matched:
        return matched, meta

    kickoff = match.get('utcDate') or match.get('kickoff') or ''
    date_part = str(kickoff)[:10]
    if not date_part:
        return None, meta

    day_url = _sportsdb_url('eventsday.php', {'d': date_part, 'l': 'English Premier League'})
    day_data, day_meta = _fetch_external_json(
        day_url,
        f"thesportsdb:eventsday:EPL:{date_part}",
        cache_timeout,
        'TheSportsDB',
    )
    day_events = day_data.get('events') or day_data.get('event') or []
    if isinstance(day_events, dict):
        day_events = [day_events]
    return next((event for event in day_events if _sportsdb_event_matches(match, event)), None), day_meta


def fetch_thesportsdb_event_stats(match, return_meta=False):
    event, event_meta = _sportsdb_find_event(match)
    if not event or not event.get('idEvent'):
        meta = {'source': 'TheSportsDB', 'event_search': event_meta, 'matched_event': None}
        return ({}, meta) if return_meta else {}

    cache_timeout = int(getattr(settings, 'THESPORTSDB_CACHE_SECONDS', 6 * 60 * 60))
    stats_url = _sportsdb_url('lookupeventstats.php', {'id': event.get('idEvent')})
    stats_data, stats_meta = _fetch_external_json(
        stats_url,
        f"thesportsdb:eventstats:{event.get('idEvent')}",
        cache_timeout,
        'TheSportsDB',
    )
    meta = {
        'source': 'TheSportsDB',
        'event_search': event_meta,
        'stats_request': stats_meta,
        'matched_event': {
            'idEvent': event.get('idEvent'),
            'strEvent': event.get('strEvent'),
            'dateEvent': event.get('dateEvent'),
            'strHomeTeam': event.get('strHomeTeam'),
            'strAwayTeam': event.get('strAwayTeam'),
        },
    }
    return (stats_data, meta) if return_meta else stats_data


def fetch_pl_teams():
    data = fetch_json('/competitions/PL/teams', cache_timeout=24 * 60 * 60)
    return data.get('teams', [])


def fetch_team_players(team_id):
    data = fetch_json(f'/teams/{team_id}', cache_timeout=24 * 60 * 60)
    return data.get('squad', [])


def fetch_pl_scorers(limit=30):
    data = fetch_json('/competitions/PL/scorers', {'limit': limit}, cache_timeout=30 * 60)
    return data.get('scorers', [])
