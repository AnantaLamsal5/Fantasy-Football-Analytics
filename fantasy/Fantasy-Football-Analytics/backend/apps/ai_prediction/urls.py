from django.urls import path

from .views import (
    FantasyPointsProjectionView,
    MatchPredictionView,
    MyTeamSuggestionView,
    PlayerPerformanceView,
    PredictionAdminPerformanceView,
    WeekPredictionView,
)

urlpatterns = [
    path('match/<str:match_id>/', MatchPredictionView.as_view(), name='prediction_match'),
    path('week/<int:matchweek>/', WeekPredictionView.as_view(), name='prediction_week'),
    path('player/<str:player_name>/', PlayerPerformanceView.as_view(), name='prediction_player'),
    path('my-team/fantasy-points/', FantasyPointsProjectionView.as_view(), name='prediction_my_team_points'),
    path('my-team/suggestions/', MyTeamSuggestionView.as_view(), name='prediction_my_team'),
    path('admin/performance/', PredictionAdminPerformanceView.as_view(), name='prediction_admin_performance'),
]
