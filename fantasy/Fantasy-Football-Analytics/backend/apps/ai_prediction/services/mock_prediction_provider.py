from datetime import datetime


class MockPredictionProvider:
    """Deterministic provider used for phase-1 contract integration."""

    def match_outcome(self, *, match):
        match_id = int(match.get('id', 0))
        seed = (match_id % 100) / 100

        home = round(0.45 + (seed * 0.2), 3)
        draw = round(0.2 + ((1 - seed) * 0.12), 3)
        away = round(max(0.01, 1 - home - draw), 3)

        winner = 'home' if home >= max(draw, away) else ('away' if away > draw else 'draw')
        return {
            'home_win_probability': home,
            'draw_probability': draw,
            'away_win_probability': away,
            'predicted_winner': winner,
            'confidence': max(home, draw, away),
            'model_version': 'mock_v1',
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }

    def player_performance(self, *, player_name):
        baseline = (len(player_name or '') % 10) / 10
        return {
            'player': player_name,
            'expected_goals': round(0.15 + baseline, 2),
            'expected_assists': round(0.05 + (baseline / 2), 2),
            'confidence': round(0.6 + (baseline / 3), 2),
            'model_version': 'mock_v1',
        }

    def fantasy_points_projection(self, *, squad_players):
        player_count = len(squad_players or [])
        projected = round((player_count * 3.75) + 12.5, 2)
        return {
            'projected_points': projected,
            'player_count': player_count,
            'confidence': 0.67,
            'model_version': 'mock_v1',
        }

    def recommendations(self, *, username):
        return {
            'formation_insight': '4-4-2 is projected as stable for upcoming fixtures.',
            'transfer_suggestions': [
                {
                    'action': 'swap',
                    'player_out': 'Low Form Midfielder',
                    'player_in': 'High Form Midfielder',
                    'expected_points_gain': 7.5,
                    'confidence': 0.71,
                }
            ],
            'confidence_scores': {
                'transfer_suggestions': 0.71,
                'formation': 0.68,
            },
            'for_user': username,
            'model_version': 'mock_v1',
        }
