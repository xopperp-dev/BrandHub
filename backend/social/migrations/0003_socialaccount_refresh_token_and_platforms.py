from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0002_socialaccount_profile_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialaccount',
            name='_refresh_token_encrypted',
            field=models.TextField(blank=True, db_column='refresh_token_encrypted'),
        ),
        migrations.AlterField(
            model_name='socialaccount',
            name='platform',
            field=models.CharField(
                choices=[
                    ('facebook', 'Facebook'),
                    ('instagram', 'Instagram'),
                    ('linkedin', 'LinkedIn'),
                    ('x', 'X (Twitter)'),
                    ('reddit', 'Reddit'),
                    ('youtube', 'YouTube'),
                ],
                max_length=20,
            ),
        ),
    ]