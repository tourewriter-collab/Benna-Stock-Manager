/*
  # Sync User IDs with Supabase Auth

  This migration ensures that the admin user can be properly migrated to use
  the Supabase Auth user ID. It creates a temporary policy that allows
  authenticated users to delete their old user records during the migration process.

  ## Changes
  
  1. Add a temporary policy to allow users to delete old records by email
  2. This enables the migration flow in the AuthContext to work properly
  
  ## Security
  
  - Users can only delete records with their own email
  - This policy works alongside the admin delete policy
  - Used only during the auth migration process
*/

-- Create a policy that allows authenticated users to delete their old user record by email
CREATE POLICY "Allow user migration delete by email"
  ON users FOR DELETE
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- This policy allows:
-- 1. An authenticated user to delete the old user record that has their email
-- 2. This is needed when the auth user ID differs from the original DB user ID
-- 3. After deletion, a new record with the auth user ID can be inserted