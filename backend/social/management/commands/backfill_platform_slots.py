"""
Backfills missing SocialAccount platform slots on existing clients.

New clients get one SocialAccount row per platform in PLATFORM_CHOICES
automatically (see ClientSerializer.create). Clients created before a new
platform was added to PLATFORM_CHOICES (e.g. Pinterest, Tumblr) are missing
those rows — this command fills the gaps without touching anything that's
already connected.

Usage:
    python manage.py backfill_platform_slots            # apply
    python manage.py backfill_platform_slots --dry-run   # preview only
"""

from django.core.management.base import BaseCommand

from social.models import Client, SocialAccount, PLATFORM_CHOICES


class Command(BaseCommand):
    help = "Create missing SocialAccount rows for any platform not yet present on each client."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without writing to the database.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        all_platforms = [p for p, _ in PLATFORM_CHOICES]

        created_count = 0
        clients = Client.objects.all().prefetch_related('accounts')

        for client in clients:
            existing = set(client.accounts.values_list('platform', flat=True))
            missing = [p for p in all_platforms if p not in existing]

            if not missing:
                continue

            self.stdout.write(f'{client.name} ({client.organization.name}): missing {missing}')

            if not dry_run:
                for platform in missing:
                    SocialAccount.objects.create(client=client, platform=platform)
                    created_count += 1

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes were made.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Created {created_count} missing platform slot(s).'))