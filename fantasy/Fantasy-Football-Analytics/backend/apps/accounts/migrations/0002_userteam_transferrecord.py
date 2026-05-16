# Generated manually for MongoDB backend.

import django.db.models.deletion
import django_mongodb_backend.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserTeam',
            fields=[
                ('id', django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('budget', models.DecimalField(decimal_places=1, default=100.0, max_digits=6)),
                ('free_transfers', models.PositiveIntegerField(default=1)),
                ('players', models.JSONField(blank=True, default=list)),
                ('points', models.PositiveIntegerField(default=0)),
                ('rank', models.CharField(default='-', max_length=50)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='team', to='accounts.user')),
            ],
            options={
                'db_table': 'UserTeams',
            },
        ),
        migrations.CreateModel(
            name='TransferRecord',
            fields=[
                ('id', django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('player_out', models.CharField(max_length=120)),
                ('player_in', models.CharField(max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transfer_records', to='accounts.user')),
            ],
            options={
                'db_table': 'TransferRecords',
            },
        ),
    ]
