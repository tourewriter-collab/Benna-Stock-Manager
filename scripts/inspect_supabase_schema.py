# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import urllib.request
from pathlib import Path

env_path = Path(__file__).parent.parent / '.env'
env_vars = {}
for line in env_path.read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        env_vars[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = env_vars.get('VITE_SUPABASE_URL') or env_vars.get('SUPABASE_URL')
SUPABASE_KEY = (env_vars.get('SUPABASE_SERVICE_ROLE_KEY') or env_vars.get('VITE_SUPABASE_SERVICE_ROLE_KEY'))

def fetch(table):
    url = f'{SUPABASE_URL}/rest/v1/{table}?limit=1'
    req = urllib.request.Request(url)
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            if data:
                return list(data[0].keys())
            # Try schema introspection if table empty
            return ['(empty table - no columns visible)']
    except Exception as e:
        return [f'ERROR: {e}']

for table in ['inventory', 'orders', 'order_items', 'usage_logs', 'payments', 'suppliers']:
    cols = fetch(table)
    print(f'\n[{table}]')
    print('  Columns:', cols)
