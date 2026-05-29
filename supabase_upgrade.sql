-- ============================================================
-- BENNA STOCK MANAGER — FORCE SCHEMA UPGRADE
-- Run this in the Supabase SQL Editor.
-- This script explicitly ALTERS existing tables to add missing columns
-- required by the new local SQLite database schema.
-- ============================================================

-- 1. INVENTORY
ALTER TABLE public.inventory 
  ADD COLUMN IF NOT EXISTS category_id TEXT,
  ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_stock INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

-- Rename unit_price to price if price doesn't exist
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='inventory' AND column_name='unit_price') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='inventory' AND column_name='price') THEN
      ALTER TABLE public.inventory RENAME COLUMN unit_price TO price;
  END IF;
END $$;

-- Rename min_quantity to min_stock if needed (we added IF NOT EXISTS above, but just in case we need to migrate data)
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='inventory' AND column_name='min_quantity') THEN
      UPDATE public.inventory SET min_stock = min_quantity WHERE min_stock = 10;
  END IF;
END $$;

-- 2. ORDERS
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS expected_date DATE,
  ADD COLUMN IF NOT EXISTS paid_amount REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS actual_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='orders' AND column_name='expected_delivery_date') THEN
      UPDATE public.orders SET expected_date = expected_delivery_date WHERE expected_date IS NULL;
  END IF;
END $$;

-- 3. ORDER_ITEMS
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS delivered_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

-- Rename inventory_id to inventory_item_id if needed
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='order_items' AND column_name='inventory_id') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='order_items' AND column_name='inventory_item_id') THEN
      ALTER TABLE public.order_items RENAME COLUMN inventory_id TO inventory_item_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='order_items' AND column_name='total_price') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='order_items' AND column_name='total') THEN
      ALTER TABLE public.order_items RENAME COLUMN total_price TO total;
  END IF;
END $$;

-- 4. PAYMENTS
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='payments' AND column_name='payment_method') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='payments' AND column_name='method') THEN
      ALTER TABLE public.payments RENAME COLUMN payment_method TO method;
  END IF;
END $$;

-- 5. SUPPLIERS
ALTER TABLE public.suppliers 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='suppliers' AND column_name='contact_person') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='suppliers' AND column_name='contact') THEN
      ALTER TABLE public.suppliers RENAME COLUMN contact_person TO contact;
  END IF;
END $$;

-- 6. CATEGORIES
ALTER TABLE public.categories 
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

-- 7. USERS
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

-- Rename password_hash to password
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
      ALTER TABLE public.users RENAME COLUMN password_hash TO password;
  END IF;
END $$;

-- 8. AUDIT LOGS
ALTER TABLE public.audit_logs 
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS _sync_error TEXT;

DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='old_data') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='old_values') THEN
      ALTER TABLE public.audit_logs RENAME COLUMN old_data TO old_values;
  END IF;
  
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='new_data') AND
     NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='new_values') THEN
      ALTER TABLE public.audit_logs RENAME COLUMN new_data TO new_values;
  END IF;
END $$;

-- ============================================================
-- Ensure all Realtime broadcasts are enabled
-- ============================================================
DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY[
        'users','inventory','categories','suppliers','orders','order_items',
        'payments','usage_logs','audit_logs','accounts','invoices','transactions',
        'trucks','granite_deliveries','notifications','employees','applicants','settings'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime' AND tablename = t
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END IF;
    END LOOP;
END $$;
