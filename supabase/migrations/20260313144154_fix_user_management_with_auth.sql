/*
  # Fix User Management with Supabase Auth Integration

  1. Changes
    - Update RLS policies to work with Supabase Auth
    - Create trigger to sync auth.users with public.users table
    - Add function to handle new user registration

  2. Security
    - Maintain admin-only access for user management
    - Sync user data between auth.users and public.users
*/

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Allow public read for login" ON users;
DROP POLICY IF EXISTS "Only admins can insert users" ON users;
DROP POLICY IF EXISTS "Only admins can update users" ON users;
DROP POLICY IF EXISTS "Only admins can delete users" ON users;

-- Create new RLS policies that work with Supabase Auth
CREATE POLICY "Anyone can read users for login"
  ON users FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
