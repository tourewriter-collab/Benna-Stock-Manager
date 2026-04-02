/*
  # Fix User Insert Policy for Migration

  1. Changes
    - Update the INSERT policy on users table to allow users to insert their own record
    - This enables the migration flow during login where auth user IDs need to be synced
    - Users can only insert a record with their own auth.uid() as the id
    - Admins can still insert any user record

  2. Security
    - Users can only create a record for themselves (id = auth.uid())
    - This prevents users from creating records for other user IDs
    - Maintains admin ability to create any user
*/

DROP POLICY IF EXISTS "Admins can insert users" ON users;

CREATE POLICY "Users can insert own record or admins can insert any"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = id) OR
    (EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    ))
  );
