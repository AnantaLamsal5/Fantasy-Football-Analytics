from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import PredictionRequestSerializer
from .services.prediction_service import PredictionService


class MatchPredictionView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, match_id):
        service = PredictionService()
        result = service.get_match_prediction(match_id=match_id)
        if not result:
            return Response({'detail': 'Match not found.'}, status=status.HTTP_404_NOT_FOUND)

        service.save_history(
            user=request.user,
            prediction_type='match_outcome',
            input_payload={'match_id': match_id},
            result_payload=result,
        )
        return Response(result)


class WeekPredictionView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, matchweek):
        serializer = PredictionRequestSerializer(data={
            'matchweek': matchweek,
            'confidence_threshold': request.query_params.get('confidence_threshold', 0),
        })
        serializer.is_valid(raise_exception=True)

        service = PredictionService()
        result = service.get_week_predictions(
            matchweek=serializer.validated_data['matchweek'],
            confidence_threshold=serializer.validated_data.get('confidence_threshold', 0),
        )

        service.save_history(
            user=request.user,
            prediction_type='week_batch',
            input_payload={
                'matchweek': matchweek,
                'confidence_threshold': serializer.validated_data.get('confidence_threshold', 0),
            },
            result_payload=result,
        )
        return Response(result)


class MyTeamSuggestionView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        service = PredictionService()
        result = service.get_team_suggestions(user=request.user)
        service.save_history(
            user=request.user,
            prediction_type='team_recommendation',
            input_payload={'user_id': str(request.user.pk)},
            result_payload=result,
        )
        return Response(result)


class PlayerPerformanceView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, player_name):
        service = PredictionService()
        result = service.get_player_performance(player_name=player_name)
        service.save_history(
            user=request.user,
            prediction_type='player_performance',
            input_payload={'player_name': player_name},
            result_payload=result,
        )
        return Response(result)


class FantasyPointsProjectionView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        service = PredictionService()
        result = service.get_fantasy_points_projection(user=request.user)
        service.save_history(
            user=request.user,
            prediction_type='fantasy_points',
            input_payload={'user_id': str(request.user.pk)},
            result_payload=result,
        )
        return Response(result)


class PredictionAdminPerformanceView(APIView):
    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request):
        return Response(
            {
                'model_version': 'mock_v1',
                'status': 'phase_1_scaffold',
                'accuracy_last_month': None,
                'predictions_made': None,
                'next_retraining': None,
            }
        )
