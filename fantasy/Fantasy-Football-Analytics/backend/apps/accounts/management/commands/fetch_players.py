import urllib.request
import json
# pyrefly: ignore [missing-import]
from django.core.management.base import BaseCommand
# pyrefly: ignore [missing-import]
from django.conf import settings
from decimal import Decimal
import random

from accounts.models import Player

class Command(BaseCommand):
    help = 'Fetches teams and players from the football-data API and populates the Player model with calculated costs.'

    def handle(self, *args, **kwargs):
        api_key = settings.FOOTBALL_DATA_API_KEY
        if not api_key:
            self.stdout.write(self.style.ERROR('FOOTBALL_DATA_API_KEY not set in settings!'))
            return
            
        leagues = ['PL']
        headers = {'X-Auth-Token': api_key}
        total_count = 0
        
        def normalize_position(pos):
            if not pos: return 'Unknown'
            p = pos.lower()
            if any(x in p for x in ['goalkeeper', 'goalie']):
                return 'Goalkeeper'
            if any(x in p for x in ['defence', 'defender', 'back', 'full-back', 'wing-back']):
                return 'Defence'
            if any(x in p for x in ['midfield', 'midfielder', 'dm', 'am']):
                return 'Midfield'
            if any(x in p for x in ['offence', 'forward', 'striker', 'winger', 'centre-forward']):
                return 'Offence'
            return 'Unknown'

        for league_code in leagues:
            self.stdout.write(self.style.HTTP_INFO(f"\n--- Fetching League: {league_code} ---"))
            url = f'https://api.football-data.org/v4/competitions/{league_code}/teams'
            req = urllib.request.Request(url, headers=headers)
            
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read())
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Failed to fetch API Teams for {league_code}: {e}'))
                if '429' in str(e):
                    self.stdout.write(self.style.NOTICE("Rate limit hit, waiting 60 seconds..."))
                    import time
                    time.sleep(60)
                continue

            teams = data.get('teams', [])
            self.stdout.write(f"Found {len(teams)} teams in {league_code}.")
            
            import time
            for index, team in enumerate(teams):
                team_id = team.get('id')
                team_name = team.get('name', 'Unknown')
                
                self.stdout.write(f"  [{index+1}/{len(teams)}] Squad for {team_name}...")
                
                team_url = f'https://api.football-data.org/v4/teams/{team_id}'
                team_req = urllib.request.Request(team_url, headers=headers)
                try:
                    with urllib.request.urlopen(team_req) as t_resp:
                        t_data = json.loads(t_resp.read())
                        squad = t_data.get('squad', [])
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"    Skipping team {team_name}: {e}"))
                    if '429' in str(e):
                        self.stdout.write(self.style.NOTICE("    Rate limit hit, waiting 60 seconds..."))
                        time.sleep(60)
                    continue
                    
                for p in squad:
                    pid = p.get('id')
                    name = p.get('name')
                    raw_pos = p.get('position', 'Unknown')
                    norm_pos = normalize_position(raw_pos)
                    dob = p.get('dateOfBirth')
                    nationality = p.get('nationality', '')
                    
                    if norm_pos == 'Goalkeeper':
                        base_cost = random.uniform(4.0, 5.5)
                    elif norm_pos == 'Defence':
                        base_cost = random.uniform(4.0, 7.5)
                    elif norm_pos == 'Midfield':
                        base_cost = random.uniform(4.5, 11.5)
                    elif norm_pos == 'Offence':
                        base_cost = random.uniform(5.0, 13.0)
                    else:
                        base_cost = 4.5
                        
                    real_cost = Decimal(round(base_cost * 10)) * Decimal('100000')
                    
                    Player.objects.update_or_create(
                        player_api_id=pid,
                        defaults={
                            'name': name,
                            'position': norm_pos,
                            'date_of_birth': dob if dob else None,
                            'nationality': nationality,
                            'team_name': team_name,
                            'team_api_id': team_id,
                            'cost': real_cost
                        }
                    )
                    total_count += 1
                
                # Rate limiting: 10 requests per minute = 1 request every 6 seconds
                # We sleep between team squad fetches
                time.sleep(6.5)
                    
        self.stdout.write(self.style.SUCCESS(f'\nFinished! Imported/updated {total_count} players total.'))

