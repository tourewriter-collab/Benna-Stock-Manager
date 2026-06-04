-- ============================================================
-- BENNA STOCK MANAGER — HR ATTENDANCE SYNC SCHEMA (SAFE / IDEMPOTENT)
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Add device_enroll_id column to employees table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'employees' 
          AND column_name = 'device_enroll_id'
    ) THEN
        ALTER TABLE public.employees ADD COLUMN device_enroll_id TEXT;
    END IF;
END $$;

-- 2. Create attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
    device_enroll_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    verification_method TEXT CHECK (verification_method IN ('face', 'fingerprint', 'card', 'password', 'manual', 'unknown')),
    direction TEXT CHECK (direction IN ('in', 'out', 'break_in', 'break_out', 'unknown')) DEFAULT 'unknown',
    source TEXT CHECK (source IN ('online_push', 'usb_import', 'manual_entry')) DEFAULT 'online_push',
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 4. Re-create RLS policies safely
DO $$
DECLARE
    p TEXT;
BEGIN
    FOR p IN
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', p);
    END LOOP;
END $$;

CREATE POLICY "auth_select_attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_attendance" ON public.attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_attendance" ON public.attendance FOR DELETE TO authenticated USING (true);

-- 5. Add to Realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'attendance'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
    END IF;
END $$;
