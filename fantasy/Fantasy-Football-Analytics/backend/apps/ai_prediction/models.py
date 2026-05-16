from django.db import models
from django.utils import timezone


class PredictionCache(models.Model):
    cache_key = models.CharField(max_length=120, unique=True)
    payload = models.JSONField(default=dict)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=['expires_at']),
        ]


class PredictionHistory(models.Model):
    user_id = models.CharField(max_length=64, db_index=True)
    prediction_type = models.CharField(max_length=40, db_index=True)
    input_payload = models.JSONField(default=dict)
    result_payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
