/*
  # Allow User Migration Insert Policy

  This migration creates a temporary policy to allow user records to be created
  during the authentication migration process. This is necessary because when
  a user signs up via Supabase Auth, we need to create a corresponding record
  in the users table with the auth user's ID.

  ## Changes
  
  1. Add a policy that allows authenticated users to insert their own user record
     during the signup/migration process
  
  ## Security
  
  - Users can only insert a record with their own auth.uid()
  - This policy is only used during the signup/migration flow
  - Admin policies still control all other user management operations
*/

-- Drop the existing insert policy if it exists
DROP POLICY IF EXISTS "Allow user migration insert" ON users;

-- Create a policy that allows users to insert their own record during signup
CREATE POLICY "Allow user migration insert"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
  );

-- This policy allows:
-- 1. A user who just signed up via Supabase Auth to create their user record
-- 2. The user record must have the same ID as the auth user ID
-- 3. This works alongside the admin insert policy