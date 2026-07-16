from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0003_socialaccount_refresh_token_and_platforms'),
    ]

    operations = [
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
                    ('pinterest', 'Pinterest'),
                    ('tumblr', 'Tumblr'),
                ],
                max_length=20,
            ),
        ),
    ]