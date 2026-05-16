from decimal import Decimal
from django.core.management.base import BaseCommand
from accounts.models import UserTeam, Player


class Command(BaseCommand):
    help = 'Fix all UserTeam budgets: reset any budget below 1,000,000 to 100M minus squad cost. Also removes any players with invalid (non-integer) IDs.'

    def handle(self, *args, **kwargs):
        teams = UserTeam.objects.all()
        updated = 0
        for team in teams:
            try:
                current_budget = float(team.budget)
            except (TypeError, ValueError):
                current_budget = 0

            # Sanitize squad: remove any player whose id is not a real integer player_api_id
            original_count = len(team.players or [])
            clean_players = []
            for p in (team.players or []):
                if not isinstance(p, dict):
                    continue
                pid = p.get('id')
                try:
                    int(pid)  # Only keep players with numeric IDs
                    clean_players.append(p)
                except (TypeError, ValueError):
                    self.stdout.write(f"  Removing invalid player id={pid!r}")

            squad_changed = len(clean_players) != original_count
            if squad_changed:
                team.players = clean_players
                self.stdout.write(f"  Cleaned squad for user {team.user_id}: removed {original_count - len(clean_players)} invalid players")

            # Fix budget if it looks wrong (less than 1M)
            if current_budget < 1_000_000:
                total_cost = 0
                for p in clean_players:
                    player_obj = Player.objects.filter(
                        player_api_id=p.get('id')
                    ).first()
                    if player_obj:
                        total_cost += float(player_obj.cost)

                new_budget = max(0, 100_000_000.00 - total_cost)
                team.budget = Decimal(str(new_budget))
                self.stdout.write(
                    f"  Fixed budget for user {team.user_id}: {current_budget} → {new_budget:,.2f}"
                )
                updated += 1

            if squad_changed or current_budget < 1_000_000:
                team.save()

        self.stdout.write(
            self.style.SUCCESS(f'Done. Updated {updated} team budget(s).')
        )
