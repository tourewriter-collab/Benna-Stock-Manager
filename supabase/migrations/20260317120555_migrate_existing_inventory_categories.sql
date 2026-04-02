/*
  # Migrate Existing Inventory Categories

  1. Data Migration
    - Map existing category text values to new category_id references
    - Update inventory records with proper category_id
    - Handle unmapped categories by assigning to a default or keeping NULL
  
  2. Notes
    - This migration attempts to match existing category strings to the new categories
    - Unmatched categories will remain with NULL category_id (can be updated manually)
*/

-- Update inventory items to use category_id based on existing category text
UPDATE inventory
SET category_id = (
  SELECT id FROM categories
  WHERE LOWER(name_en) = LOWER(inventory.category)
  OR LOWER(name_fr) = LOWER(inventory.category)
  LIMIT 1
)
WHERE category IS NOT NULL AND category != '';

-- Optional: Drop the old category column if all data is migrated
-- Uncomment the following lines after verifying data migration is successful
-- ALTER TABLE inventory DROP COLUMN IF EXISTS category;