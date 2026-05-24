from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_remove_userteam_free_transfers'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='ban_starts_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='player',
            name='ban_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='player',
            name='ban_reason',
            field=models.CharField(blank=True, default='', max_length=250),
        ),
    ]
