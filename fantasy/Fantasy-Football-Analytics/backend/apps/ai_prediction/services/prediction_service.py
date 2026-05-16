from datetime import timedelta

from django.utils import timezone

from accounts.football_data import fetch_pl_matches
from accounts.models import UserTeam

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
        return self.provider.player_performance(player_name=player_name)

    def save_history(self, *, user, prediction_type, input_payload, result_payload):
        PredictionHistory.objects.create(
            user_id=str(user.pk),
            prediction_type=prediction_type,
            input_payload=input_payload,
            result_payload=result_payload,
        )
