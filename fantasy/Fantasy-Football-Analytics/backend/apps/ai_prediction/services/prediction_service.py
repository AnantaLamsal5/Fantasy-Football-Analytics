from datetime import timedelta
from math import sqrt

from django.utils import timezone

from accounts.football_data import fetch_pl_matches
from accounts.models import Player, UserTeam

from ..models import PredictionCache, PredictionHistory
from .mock_prediction_provider import MockPredictionProvider


class PredictionService:
    def __init__(self, provider=None):
        self.provider = provider or MockPredictionProvider()

    def get_week_predictions(self, *, matchweek, confidence_threshold=0.0):
        cache_key = f'week:{matchweek}:threshold:{confidence_threshold}'
        cached = PredictionCache.objects.filter(cache_key=cache_key).first()
        if cached and cached.expires_at > timezone.now():
            return {'from_cache': True, **cached.payload}

        matches = fetch_pl_matches(limit=None, status='SCHEDULED')
        target_matches = [match for match in matches if match.get('matchday') == matchweek] or matches[:10]
        predictions = []
        for match in target_matches:
            area = (match.get('score') or {}).get('fullTime')
            if area:
                continue

            prediction = self.provider.match_outcome(match=match)
            if prediction.get('confidence', 0) < confidence_threshold:
                continue

            predictions.append(
                {
                    'match_id': match.get('id'),
                    'home_team': (match.get('homeTeam') or {}).get('name', 'Unknown'),
                    'away_team': (match.get('awayTeam') or {}).get('name', 'Unknown'),
                    'prediction': prediction,
                }
            )

        payload = {
            'matchweek': matchweek,
            'predictions': predictions,
            'cached_at': timezone.now().isoformat(),
            'cache_expires': (timezone.now() + timedelta(hours=6)).isoformat(),
        }

        PredictionCache.objects.update_or_create(
            cache_key=cache_key,
            defaults={
                'payload': payload,
                'expires_at': timezone.now() + timedelta(hours=6),
            },
        )
        return {'from_cache': False, **payload}

    def get_match_prediction(self, *, match_id):
        matches = fetch_pl_matches(limit=80)
        match = next((m for m in matches if str(m.get('id')) == str(match_id)), None)
        if not match:
            return None

        return {
            'match_id': match.get('id'),
            'home_team': (match.get('homeTeam') or {}).get('name', 'Unknown'),
            'away_team': (match.get('awayTeam') or {}).get('name', 'Unknown'),
            'prediction': self.provider.match_outcome(match=match),
        }

    def get_team_suggestions(self, *, user):
        team = UserTeam.objects.filter(user=user).first()
        squad_players = (team.players if team else []) or []

        recommendations = self.provider.recommendations(username=user.username)
        points_projection = self.provider.fantasy_points_projection(squad_players=squad_players)

        return {
            **recommendations,
            'points_projection': points_projection,
            'team_size': len(squad_players),
        }

    def get_fantasy_points_projection(self, *, user):
        team = UserTeam.objects.filter(user=user).first()
        squad_players = (team.players if team else []) or []
        return self.provider.fantasy_points_projection(squad_players=squad_players)

    def get_player_performance(self, *, player_name):
        performance = self.provider.player_performance(player_name=player_name)
        return {
            **performance,
            'similar_players': self._similar_player_suggestions(player_name=player_name, limit=5),
        }

    def _similar_player_suggestions(self, *, player_name, limit=5):
        target = self._find_player(player_name)
        if not target:
            return []

        target_role = self._position_role(target.position)
        target_metrics = self._player_similarity_metrics(target)
        candidates = Player.objects.exclude(pk=target.pk)

        matches = []
        for candidate in candidates:
            if self._position_role(candidate.position) != target_role:
                continue

            candidate_metrics = self._player_similarity_metrics(candidate)
            distance = self._metric_distance(target_metrics, candidate_metrics)
            matches.append((distance, candidate.name))

        matches.sort(key=lambda item: (item[0], item[1].lower()))
        return [name for _, name in matches[:limit]]

    def _find_player(self, player_name):
        query = (player_name or '').strip()
        if not query:
            return None

        return (
            Player.objects.filter(name__iexact=query).first()
            or Player.objects.filter(name__icontains=query).first()
        )

    def _position_role(self, position):
        value = (position or '').strip().lower()
        if any(term in value for term in ('forward', 'winger', 'attacker', 'offence', 'striker')):
            return 'forward_winger'
        if any(term in value for term in ('midfield', 'midfielder')):
            return 'midfielder'
        if any(term in value for term in ('defender', 'back', 'goalkeeper', 'keeper')):
            return 'defender_goalkeeper'
        return value or 'unknown'

    def _player_similarity_metrics(self, player):
        role = self._position_role(player.position)
        seed = self._player_seed(player)
        value_score = self._value_score(player)

        if role == 'forward_winger':
            return {
                'xg': round(0.08 + (value_score * 0.72) + (seed * 0.18), 3),
                'xa': round(0.04 + (value_score * 0.38) + (seed * 0.14), 3),
                'dribble_success_rate': round(42 + (seed * 28) + (value_score * 12), 3),
                'shots_on_target': round(0.7 + (value_score * 2.8) + (seed * 0.8), 3),
            }

        if role == 'midfielder':
            return {
                'passing_accuracy': round(72 + (value_score * 13) + (seed * 8), 3),
                'progressive_passes': round(2.2 + (value_score * 4.5) + (seed * 1.7), 3),
                'key_passes': round(0.6 + (value_score * 2.5) + (seed * 0.9), 3),
                'chances_created': round(0.8 + (value_score * 2.8) + (seed * 1.1), 3),
            }

        return {
            'interceptions': round(0.8 + ((1 - seed) * 2.2) + (value_score * 1.2), 3),
            'tackles_won': round(1.0 + (seed * 2.4) + (value_score * 1.1), 3),
            'aerial_duels_won_rate': round(45 + ((1 - seed) * 25) + (value_score * 12), 3),
            'clean_sheets': round(2 + (value_score * 10) + ((1 - seed) * 3), 3),
        }

    def _player_seed(self, player):
        raw = f'{player.name}|{player.position}|{player.team_name}'
        return (sum(ord(char) for char in raw) % 100) / 100

    def _value_score(self, player):
        try:
            value = float(player.cost or 0)
        except (TypeError, ValueError):
            value = 0

        return max(0, min(value / 100000000, 1))

    def _metric_distance(self, target_metrics, candidate_metrics):
        keys = target_metrics.keys()
        return sqrt(
            sum((float(target_metrics[key]) - float(candidate_metrics.get(key, 0))) ** 2 for key in keys)
        )

    def save_history(self, *, user, prediction_type, input_payload, result_payload):
        PredictionHistory.objects.create(
            user_id=str(user.pk),
            prediction_type=prediction_type,
            input_payload=input_payload,
            result_payload=result_payload,
        )
