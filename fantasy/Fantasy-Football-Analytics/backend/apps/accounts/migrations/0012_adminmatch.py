import django_mongodb_backend.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_profile_picture_processed_match_results'),
    ]

    operations = [
        migrations.CreateModel(
            name='AdminMatch',
            fields=[
                ('id', django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('home_team', models.CharField(max_length=150)),
                ('away_team', models.CharField(max_length=150)),
                ('matchday', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(default='Scheduled', max_length=50)),
                ('home_score', models.IntegerField(blank=True, null=True)),
                ('away_score', models.IntegerField(blank=True, null=True)),
                ('kickoff', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'AdminMatches',
            },
        ),
    ]
