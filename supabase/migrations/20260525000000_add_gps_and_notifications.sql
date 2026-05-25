-- Supabase Migration: 20260525000000_add_gps_and_notifications.sql

-- 1. Add GPS tracking columns to the trucks table
ALTER TABLE public.trucks
ADD COLUMN IF NOT EXISTS latitude REAL,
ADD COLUMN IF NOT EXISTS longitude REAL,
ADD COLUMN IF NOT EXISTS last_location_update TEXT;

-- 2. Create the notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT false,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    _sync_error TEXT
);

-- 3. Enable Row Level Security (RLS) on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Create policies for notifications
CREATE POLICY "Allow all authenticated users to read notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow all authenticated users to insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow all authenticated users to delete notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (true);

-- 5. Notify Realtime
alter publication supabase_realtime add table notifications;
