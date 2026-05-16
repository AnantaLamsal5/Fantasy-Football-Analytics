from rest_framework import serializers


class PredictionRequestSerializer(serializers.Serializer):
    match_id = serializers.IntegerField(required=False)
    matchweek = serializers.IntegerField(required=False)
    confidence_threshold = serializers.FloatField(required=False, min_value=0, max_value=1)


class MatchPredictionSerializer(serializers.Serializer):
    match_id = serializers.IntegerField()
    home_team = serializers.CharField()
    away_team = serializers.CharField()
    prediction = serializers.DictField()


class TeamSuggestionSerializer(serializers.Serializer):
    formation_insight = serializers.CharField()
    transfer_suggestions = serializers.ListField()
    confidence_scores = serializers.DictField()
