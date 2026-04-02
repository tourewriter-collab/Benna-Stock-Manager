/*
  # Sync user IDs with auth.users

  1. Purpose
    - Fix RLS policy issues by ensuring users table IDs match auth.users IDs
    - This resolves the problem where authenticated users cannot insert/update records
      because auth.uid() doesn't match their users table ID

  2. Changes
    - Update users table IDs to match their corresponding auth.users IDs
    - Uses email as the matching key since that's unique across both tables

  3. Security
    - No RLS changes needed
    - Maintains data integrity by matching on email
*/

DO $$
DECLARE
  auth_user RECORD;
BEGIN
  FOR auth_user IN 
    SELECT au.id as auth_id, au.email
    FROM auth.users au
    INNER JOIN users u ON au.email = u.email
    WHERE au.id != u.id
  LOOP
    UPDATE users
    SET id = auth_user.auth_id
    WHERE email = auth_user.email;
    
    RAISE NOTICE 'Updated user % to use auth ID %', auth_user.email, auth_user.auth_id;
  END LOOP;
END $$;