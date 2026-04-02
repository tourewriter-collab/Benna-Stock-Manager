/*
  # Fix Security Issues

  ## Changes Made
  
  1. **RLS Policy Performance Optimization**
     - Updated users table policies to use `(select auth.uid())` instead of `auth.uid()`
     - This prevents re-evaluation for each row, improving query performance at scale
     - Affects: "Only admins can insert users", "Only admins can update users", "Only admins can delete users"
  
  2. **Fix Overly Permissive RLS Policies**
     - **Inventory Table**: Restrict all operations to admin and audit_manager roles only
       - Users with 'user' role should have read-only access
       - Only admins can delete inventory
       - Only admins and audit_managers can insert/update inventory
     - **Audit Logs Table**: Restrict insert to system/admin only
       - Audit logs should be system-generated, not user-insertable
       - Only admins and audit_managers can view audit logs
  
  3. **Function Security**
     - Fix `update_updated_at_column` function to have immutable search path
     - Add SECURITY DEFINER and set search_path explicitly
  
  4. **Remove Unused Indexes**
     - Drop unused indexes on audit_logs table:
       - idx_audit_logs_record_id
       - idx_audit_logs_timestamp  
       - idx_audit_logs_user_id
     - Note: These can be recreated if actual query patterns require them
  
  ## Security Improvements
  - All RLS policies now properly restrict access based on user roles
  - Performance optimized for scale with proper auth function calls
  - Audit logs are now protected from user manipulation
  - Function security hardened against search path attacks
*/

-- =====================================================
-- 1. Fix RLS Policies on Users Table (Performance)
-- =====================================================

-- Drop existing admin policies
DROP POLICY IF EXISTS "Only admins can insert users" ON users;
DROP POLICY IF EXISTS "Only admins can update users" ON users;
DROP POLICY IF EXISTS "Only admins can delete users" ON users;

-- Recreate with optimized auth.uid() calls
CREATE POLICY "Only admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users users_1
      WHERE users_1.id = (select auth.uid())
      AND users_1.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users users_1
      WHERE users_1.id = (select auth.uid())
      AND users_1.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users users_1
      WHERE users_1.id = (select auth.uid())
      AND users_1.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users users_1
      WHERE users_1.id = (select auth.uid())
      AND users_1.role = 'admin'
    )
  );

-- =====================================================
-- 2. Fix Overly Permissive Inventory RLS Policies
-- =====================================================

-- Drop all existing inventory policies
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON inventory;
DROP POLICY IF EXISTS "Authenticated users can insert inventory" ON inventory;
DROP POLICY IF EXISTS "Authenticated users can update inventory" ON inventory;
DROP POLICY IF EXISTS "Authenticated users can delete inventory" ON inventory;

-- Create restrictive policies based on role
CREATE POLICY "All authenticated users can view inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and audit managers can insert inventory"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admins and audit managers can update inventory"
  ON inventory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role IN ('admin', 'audit_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Only admins can delete inventory"
  ON inventory FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- 3. Fix Overly Permissive Audit Logs RLS Policies
-- =====================================================

-- Drop existing audit log policies
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;

-- Create restrictive policies
CREATE POLICY "Admins and audit managers can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role IN ('admin', 'audit_manager')
    )
  );

-- Note: Audit logs should be inserted via triggers or service role, not by users
-- Removed the permissive insert policy entirely

-- =====================================================
-- 4. Fix Function Search Path Mutability
-- =====================================================

-- Drop and recreate the function with secure settings
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the trigger on users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. Remove Unused Indexes
-- =====================================================

DROP INDEX IF EXISTS idx_audit_logs_record_id;
DROP INDEX IF EXISTS idx_audit_logs_timestamp;
DROP INDEX IF EXISTS idx_audit_logs_user_id;
