-- ============================================================
-- BENNA STOCK MANAGER — COMPLETE SUPABASE SCHEMA (SAFE / IDEMPOTENT)
-- Run this in the Supabase SQL Editor.
-- It is safe to run multiple times. All operations use IF NOT EXISTS
-- or DO blocks that check before acting.
-- ============================================================

-- ============================================================
-- STEP 1: CREATE ALL TABLES (must happen before policies/realtime)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'audit_manager', 'user')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_fr TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL,
    supplier TEXT,
    location TEXT NOT NULL,
    min_stock INTEGER DEFAULT 10,
    max_stock INTEGER DEFAULT 100,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
    order_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expected_date DATE,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')) DEFAULT 'pending',
    delivery_status TEXT DEFAULT 'pending',
    actual_delivery_date DATE,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    inventory_item_id TEXT REFERENCES public.inventory(id) ON DELETE SET NULL,
    description TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    delivered_quantity INTEGER DEFAULT 0,
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    total REAL NOT NULL,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    method TEXT CHECK (method IN ('cash', 'bank', 'check', 'credit', 'other')) DEFAULT 'cash',
    reference TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.usage_logs (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT REFERENCES public.inventory(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    quantity_changed INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    user_id TEXT,
    authorized_by_name TEXT,
    authorized_by_title TEXT,
    truck_id TEXT,
    transaction_type TEXT DEFAULT 'OUT',
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    invoice_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMPTZ,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')) DEFAULT 'draft',
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    invoice_id TEXT REFERENCES public.invoices(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    type TEXT CHECK (type IN ('credit', 'debit')) NOT NULL,
    transaction_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    reference TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.trucks (
    id TEXT PRIMARY KEY,
    plate_number TEXT UNIQUE NOT NULL,
    model TEXT,
    capacity REAL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
    latitude REAL,
    longitude REAL,
    last_location_update TEXT,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.granite_deliveries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    truck_id TEXT REFERENCES public.trucks(id) ON DELETE SET NULL,
    driver_name TEXT NOT NULL,
    granite_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    client_name TEXT,
    status TEXT DEFAULT 'delivered' CHECK (status IN ('pending', 'delivered', 'cancelled')),
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT false,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    salary REAL NOT NULL DEFAULT 0,
    hire_date TEXT NOT NULL,
    status TEXT CHECK (status IN ('active', 'inactive', 'on_leave')) DEFAULT 'active',
    performance_notes TEXT,
    resume_text TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.applicants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role_applied TEXT NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 0,
    skills TEXT,
    resume_text TEXT,
    ai_score REAL DEFAULT 0,
    ai_assessment TEXT,
    status TEXT CHECK (status IN ('pending', 'reviewed', 'interviewed', 'accepted', 'rejected')) DEFAULT 'pending',
    applied_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

-- ============================================================
-- STEP 2: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.granite_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 3: DROP OLD POLICIES (safe — ignores if they don't exist)
-- ============================================================

DO $$
DECLARE
    t TEXT;
    p TEXT;
    tbls TEXT[] := ARRAY[
        'users','inventory','categories','suppliers','orders','order_items',
        'payments','usage_logs','audit_logs','accounts','invoices','transactions',
        'trucks','granite_deliveries','notifications','employees','applicants','settings'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        FOR p IN
            SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
        END LOOP;
    END LOOP;
END $$;

-- ============================================================
-- STEP 4: CREATE UNIFIED RLS POLICIES (one set per table)
-- ============================================================

-- Helper macro: authenticated users get full CRUD on every table
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
        EXECUTE format(
            'CREATE POLICY "auth_select_%s" ON public.%I FOR SELECT TO authenticated USING (true)',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_update_%s" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_delete_%s" ON public.%I FOR DELETE TO authenticated USING (true)',
            t, t
        );
    END LOOP;
END $$;

-- ============================================================
-- STEP 5: ADD TO REALTIME PUBLICATION (safe — checks first)
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
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- DONE — All tables, RLS, and Realtime are now configured.
-- ============================================================
