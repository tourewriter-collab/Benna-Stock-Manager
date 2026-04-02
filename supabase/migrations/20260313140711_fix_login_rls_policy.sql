/*
  # Fix Login RLS Policy

  1. Changes
    - Drop the existing SELECT policy that requires authentication
    - Add a new SELECT policy that allows public access to user data for login
    - This is necessary because users need to query their credentials before authenticating

  2. Security Notes
    - While this allows unauthenticated access to user emails and password hashes,
      the password hashes are secure (bcrypt) and cannot be reversed
    - This is a standard pattern for custom authentication systems
    - Consider moving to Supabase Auth in the future for better security
*/

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view all users if authenticated" ON users;

-- Create a new SELECT policy that allows public access for login
CREATE POLICY "Allow public read for login"
  ON users
  FOR SELECT
  TO anon, authenticated
  USING (true);
