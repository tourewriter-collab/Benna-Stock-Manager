# -*- coding: utf-8 -*-
# Set stdout to utf-8 on Windows
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
force_push_sync.py
-------------------
One-shot script: reads all unsynced items from sync_queue, maps them to
the correct Supabase schema (same logic as sync.js), and upserts them
via the REST API. On success, removes the items from the queue.

Run from the project root:
    python scripts/force_push_sync.py
"""

import sqlite3, json, re, os, sys
from datetime import datetime, timezone
from pathlib import Path

# ── Load .env ────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / '.env'
env_vars = {}
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env_vars[k.strip()] = v.strip().strip('"').strip("'")
    print(f'[Env] Loaded {len(env_vars)} vars from {env_path}')
else:
    print(f'[Env] ERROR: .env not found at {env_path}')
    sys.exit(1)

SUPABASE_URL = env_vars.get('VITE_SUPABASE_URL') or env_vars.get('SUPABASE_URL')
SUPABASE_KEY = (env_vars.get('SUPABASE_SERVICE_ROLE_KEY') or
                env_vars.get('VITE_SUPABASE_SERVICE_ROLE_KEY') or
                env_vars.get('SERVICE_ROLE_KEY'))

if not SUPABASE_URL or not SUPABASE_KEY:
    print('[Env] ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

print(f'[Env] URL  : {SUPABASE_URL}')
print(f'[Env] Key  : {SUPABASE_KEY[:12]}...(len={len(SUPABASE_KEY)})')

# ── Helpers ───────────────────────────────────────────────────────────────────
import urllib.request, urllib.error

UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)

def is_uuid(s):
    return bool(UUID_RE.match(str(s))) if s else False

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def supabase_upsert(table, rows):
    """POST rows to Supabase REST upsert endpoint. Returns (ok, error_msg)."""
    if not rows:
        return True, None
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    body = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'resolution=merge-duplicates,return=minimal')
    try:
        with urllib.request.urlopen(req) as resp:
            return True, None
    except urllib.error.HTTPError as e:
        body_str = e.read().decode('utf-8', errors='replace')
        return False, f'HTTP {e.code}: {body_str}'
    except Exception as ex:
        return False, str(ex)

# ── Schema mappers (mirrors sync.js) ─────────────────────────────────────────
def map_categories(d):
    return {'id': d['id'], 'name_en': d.get('name_en') or 'Unknown', 'name_fr': d.get('name_fr') or 'Inconnu'}

def map_suppliers(d):
    return {
        'id': d['id'],
        'name': d.get('name') or 'Unknown',
        'contact': d.get('contact') or d.get('contact_person') or None,
        'email': d.get('email') or None,
        'phone': d.get('phone') or None,
        'address': d.get('address') or None,
        'status': d.get('status') or 'active',
    }

def map_inventory(d):
    return {
        'id': d['id'],
        'name': d.get('name') or 'Unnamed Item',
        'reference': (d.get('id') or '')[:8],
        'category': d.get('category') or 'General',
        'quantity': d.get('quantity') or 0,
        'min_quantity': d.get('min_stock') or d.get('min_quantity') or 0,
        'unit_price': d.get('price') or d.get('unit_price') or 0,
        'supplier': d.get('supplier') or None,
        'location': d.get('location') or 'Main Store',
        'category_id': d.get('category_id') or None,
    }

def map_orders(d):
    status = d.get('status')
    delivery_status = d.get('delivery_status') or 'pending'
    remote_status = 'pending'
    if status == 'paid':
        remote_status = 'delivered' if delivery_status == 'delivered' else 'confirmed'
    elif status == 'partial':
        remote_status = 'confirmed'
    elif status == 'cancelled':
        remote_status = 'cancelled'
    elif status in {'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'}:
        remote_status = status

    return {
        'id': d['id'],
        'order_number': d.get('order_number') or f'ORD-{(d.get("id") or "")[:8].upper()}',
        'supplier_id': d.get('supplier_id') or None,
        'order_date': d.get('order_date') or now_iso(),
        'expected_delivery_date': d.get('expected_date') or d.get('expected_delivery_date') or None,
        'status': remote_status,
        'total_amount': d.get('total_amount') or 0,
        'notes': d.get('notes') or None,
        'delivery_status': delivery_status,
    }

def map_order_items(d):
    q = d.get('quantity') or 1
    p = d.get('unit_price') or 0
    return {
        'id': d['id'],
        'order_id': d.get('order_id'),
        'inventory_id': d.get('inventory_item_id') or d.get('inventory_id') or '00000000-0000-0000-0000-000000000000',
        'quantity': q,
        'unit_price': p,
        'total_price': d.get('total') or d.get('total_price') or (q * p),
        'description': d.get('description') or None,
        'delivered_quantity': d.get('delivered_quantity') or 0,
    }

def map_payments(d):
    method_map = {'cash':'cash','bank':'bank_transfer','check':'check','credit':'credit_card','other':'cash'}
    return {
        'id': d['id'],
        'order_id': d.get('order_id'),
        'payment_date': d.get('payment_date') or now_iso(),
        'amount': d.get('amount') or 0,
        'payment_method': method_map.get(d.get('method') or d.get('payment_method') or '', 'cash'),
        'reference': d.get('reference') or None,
        'notes': d.get('notes') or None,
    }

def map_usage_logs(d):
    uid = d.get('user_id')
    return {
        'inventory_item_id': d.get('inventory_item_id') or d.get('inventory_id'),
        'item_name': d.get('item_name') or 'Unknown Item',
        'quantity_changed': d.get('quantity_changed') or 0,
        'previous_quantity': d.get('previous_quantity') or 0,
        'new_quantity': d.get('new_quantity') or 0,
        'transaction_type': d.get('transaction_type') or 'OUT',
        'user_id': uid if isinstance(uid, int) else None,
        'authorized_by_name': d.get('authorized_by_name') or None,
        'authorized_by_title': d.get('authorized_by_title') or None,
        'truck_id': d.get('truck_id') or None,
        'timestamp': d.get('timestamp') or now_iso(),
    }

def map_trucks(d):
    return {
        'id': d['id'],
        'plate_number': d.get('plate_number'),
        'model': d.get('model') or None,
        'capacity': d.get('capacity') or 0,
        'status': d.get('status') or 'active',
        'latitude': d.get('latitude'),
        'longitude': d.get('longitude'),
        'last_location_update': d.get('last_location_update') or None,
    }

def map_notifications(d):
    return {
        'id': d['id'],
        'message': d.get('message'),
        'type': d.get('type'),
        'created_at': d.get('created_at') or now_iso(),
        'is_read': bool(d.get('is_read')),
    }

MAPPERS = {
    'categories': map_categories,
    'suppliers': map_suppliers,
    'inventory': map_inventory,
    'orders': map_orders,
    'order_items': map_order_items,
    'payments': map_payments,
    'usage_logs': map_usage_logs,
    'trucks': map_trucks,
    'notifications': map_notifications,
}

PUSH_ORDER = ['categories', 'suppliers', 'inventory', 'trucks', 'orders', 'order_items', 'payments', 'usage_logs', 'audit_logs', 'notifications']

# ── Main ──────────────────────────────────────────────────────────────────────
db_path = Path(__file__).parent.parent / 'database.sqlite'
print(f'\n[DB] Opening {db_path}')
conn = sqlite3.connect(str(db_path))
conn.row_factory = sqlite3.Row

pending = conn.execute("SELECT * FROM sync_queue WHERE synced=0 ORDER BY created_at ASC").fetchall()
print(f'[Sync] Found {len(pending)} pending items in sync_queue\n')

if not pending:
    print('[Sync] Nothing to push. Exiting.')
    sys.exit(0)

# Group by table+action
from collections import defaultdict
groups = defaultdict(list)
for row in pending:
    groups[(row['table_name'], row['action'])].append(row)

# Process in push order
total_success = 0
total_fail = 0
ids_to_delete = []

for table in PUSH_ORDER:
    for action in ['INSERT', 'UPDATE', 'DELETE']:
        key = (table, action)
        if key not in groups:
            continue
        items = groups[key]
        mapper = MAPPERS.get(table)

        if action in ('INSERT', 'UPDATE'):
            if not mapper:
                print(f'[Sync] WARNING: No mapper for {table}, skipping {len(items)} items')
                total_fail += len(items)
                continue

            payloads = []
            for item in items:
                try:
                    data = json.loads(item['data'])
                except Exception:
                    continue
                if not data or not data.get('id'):
                    continue
                if table != 'usage_logs' and not is_uuid(data['id']):
                    print(f'[Sync]   SKIP non-UUID id={data["id"]} in {table}')
                    continue
                mapped = mapper(data)
                if mapped:
                    payloads.append(mapped)

            if not payloads:
                print(f'[Sync] {table}:{action} — no valid payloads, skipping')
                continue

            # Deduplicate by id
            seen = {}
            for p in payloads:
                if 'id' in p:
                    seen[p['id']] = p
                else:
                    seen[str(len(seen))] = p
            unique = list(seen.values())

            # Failsafe for foreign keys
            if table == 'orders':
                dummy_sups = []
                for it in unique:
                    if it.get('supplier_id'):
                        local = conn.execute("SELECT name FROM suppliers WHERE id=?", (it['supplier_id'],)).fetchone()
                        dummy_sups.append({
                            'id': it['supplier_id'],
                            'name': local[0] if local and local[0] else 'Recovered Supplier',
                            'status': 'active'
                        })
                if dummy_sups:
                    seen_sups = {}
                    for s in dummy_sups:
                        seen_sups[s['id']] = s
                    sups_list = list(seen_sups.values())
                    print(f'[Sync] Failsafe: Upserting {len(sups_list)} suppliers to cloud...')
                    ok, err = supabase_upsert('suppliers', sups_list)
                    print(f'[Sync] Failsafe: Suppliers upsert result: ok={ok}, error={err}')
            elif table == 'order_items':
                # provision unlinked fallback item in cloud
                fallback_item = {
                    'id': '00000000-0000-0000-0000-000000000000',
                    'name': 'Unlinked Fallback Item',
                    'reference': 'UNLINKED',
                    'category': 'General',
                    'quantity': 0,
                    'min_quantity': 0,
                    'unit_price': 0,
                    'location': 'Main Store'
                }
                print('[Sync] Failsafe: Upserting unlinked fallback inventory to cloud...')
                supabase_upsert('inventory', [fallback_item])

                dummy_invs = []
                for it in unique:
                    if it.get('inventory_id') and it['inventory_id'] != '00000000-0000-0000-0000-000000000000':
                        local = conn.execute("SELECT name, category FROM inventory WHERE id=?", (it['inventory_id'],)).fetchone()
                        dummy_invs.append({
                            'id': it['inventory_id'],
                            'name': local[0] if local and local[0] else 'Recovered Item',
                            'reference': it['inventory_id'][:8],
                            'category': local[1] if local and local[1] else 'General',
                            'quantity': 0,
                            'min_quantity': 0,
                            'unit_price': it.get('unit_price') or 0,
                            'supplier': None,
                            'location': 'Main Store'
                        })
                if dummy_invs:
                    seen_invs = {}
                    for iv in dummy_invs:
                        seen_invs[iv['id']] = iv
                    invs_list = list(seen_invs.values())
                    print(f'[Sync] Failsafe: Upserting {len(invs_list)} dummy inventories to cloud...')
                    ok, err = supabase_upsert('inventory', invs_list)
                    print(f'[Sync] Failsafe: Inventories upsert result: ok={ok}, error={err}')

            print(f'[Sync] Pushing {table}:{action} — {len(unique)} rows...', end='', flush=True)
            ok, err = supabase_upsert(table, unique)
            if ok:
                print(f'  OK')
                for item in items:
                    ids_to_delete.append(item['id'])
                total_success += len(items)
            else:
                print(f'  FAILED: {err}')
                # Mark error in DB
                for item in items:
                    try:
                        conn.execute("UPDATE sync_queue SET _sync_error=? WHERE id=?", (err[:500], item['id']))
                    except Exception:
                        pass
                total_fail += len(items)

        elif action == 'DELETE':
            for item in items:
                url = f'{SUPABASE_URL}/rest/v1/{table}?id=eq.{item["record_id"]}'
                req = urllib.request.Request(url, method='DELETE')
                req.add_header('apikey', SUPABASE_KEY)
                req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
                try:
                    urllib.request.urlopen(req)
                    ids_to_delete.append(item['id'])
                    total_success += 1
                    print(f'[Sync] Deleted {table} id={item["record_id"]}  ✓')
                except Exception as ex:
                    print(f'[Sync] Delete failed {table} id={item["record_id"]}: {ex}')
                    total_fail += 1

# Clean up synced items
if ids_to_delete:
    placeholders = ','.join('?' * len(ids_to_delete))
    conn.execute(f"DELETE FROM sync_queue WHERE id IN ({placeholders})", ids_to_delete)
    # Update sync_status on source tables
    print(f'\n[Sync] Cleared {len(ids_to_delete)} items from sync_queue')

conn.commit()
conn.close()

print(f'\n{"="*50}')
print(f'[Sync] Push complete: {total_success} succeeded, {total_fail} failed')
if total_fail > 0:
    print('[Sync] Check _sync_error column for failed items')
print('='*50)
