from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_adminmatch'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='userteam',
            name='free_transfers',
        ),
    ]
