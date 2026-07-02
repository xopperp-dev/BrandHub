# Generated migration — adds profile_url to SocialAccount

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialaccount',
            name='profile_url',
            field=models.URLField(
                blank=True,
                max_length=500,
                help_text='Public social media profile link',
            ),
        ),
    ]