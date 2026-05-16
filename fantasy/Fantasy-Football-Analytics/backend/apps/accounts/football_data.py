import json
from urllib import parse, request
from urllib.error import HTTPError, URLError

# pyrefly: ignore [missing-import]
from django.conf import settings


BASE_URL = 'https://api.football-data.org/v4'


def _headers():
    return {'X-Auth-Token': settings.FOOTBALL_DATA_API_KEY}


def fetch_json(path, query=None):
    query = query or {}
    url = f'{BASE_URL}{path}'
    if query:
        url = f'{url}?{parse.urlencode(query)}'
    req = request.Request(url, headers=_headers())
    try:
        with request.urlopen(req, timeout=10) as response:
            payload = response.read().decode('utf-8')
        if not payload:
            return {}
        return json.loads(payload)
    except json.JSONDecodeError:
        print(f"FOOTBALL-DATA API: Invalid JSON response from {url}")
        return {}
    except HTTPError as e:
        if e.code == 429:
            print(f"FOOTBALL-DATA API RATE LIMIT (429): Too many requests. Please wait a minute. {url}")
        elif e.code == 403:
            print(f"FOOTBALL-DATA API FORBIDDEN (403): Check your API key or subscription plan for {url}")
        else:
            print(f"FOOTBALL-DATA API HTTP Error {e.code}: {e.reason} for {url}")
        return {}
    except URLError as e:
        print(f"FOOTBALL-DATA API Network Error: {e.reason}. Check your internet connection. {url}")
        return {}
    except Exception as e:
        print(f"FOOTBALL-DATA API Unexpected Error fetching {url}: {e}")
        return {}


def fetch_pl_matches(limit=20, status=None):
    query = {}
    if status:
        query['status'] = status
    data = fetch_json('/competitions/PL/matches', query)
    matches = data.get('matches', [])
    if limit is None:
        return matches
    return matches[:limit]


def fetch_pl_teams():
    data = fetch_json('/competitions/PL/teams')
    return data.get('teams', [])


def fetch_team_players(team_id):
    data = fetch_json(f'/teams/{team_id}')
    return data.get('squad', [])


def fetch_pl_scorers(limit=30):
    data = fetch_json('/competitions/PL/scorers', {'limit': limit})
    return data.get('scorers', [])
