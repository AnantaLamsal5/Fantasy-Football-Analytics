from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_userteam_squads_active_squad_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='profile_picture',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='userteam',
            name='processed_match_results',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
