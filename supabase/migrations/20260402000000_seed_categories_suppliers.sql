-- Add is_archived column if it doesn't exist
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Seed Default Categories
INSERT INTO public.categories (id, name_en, name_fr, is_archived, sync_status)
SELECT * FROM (VALUES
  ('cat_engine', 'Engine Parts', 'Pièces moteur', false, 'synced'),
  ('cat_lubricants', 'Lubricants & Fluids', 'Lubrifiants et fluides', false, 'synced'),
  ('cat_tools', 'Tools & Equipment', 'Outils et équipement', false, 'synced'),
  ('cat_tires', 'Tires & Wheels', 'Pneus et roues', false, 'synced'),
  ('cat_brake', 'Brake & Clutch System', 'Système de frein et embrayage', false, 'synced'),
  ('cat_transmission', 'Transmission & Drivetrain', 'Transmission et chaîne cinématique', false, 'synced'),
  ('cat_suspension', 'Suspension & Steering', 'Suspension et direction', false, 'synced'),
  ('cat_electrical', 'Electrical & Electronics', 'Électrique et électronique', false, 'synced'),
  ('cat_cooling', 'Cooling System', 'Système de refroidissement', false, 'synced'),
  ('cat_fuel', 'Fuel System', $$Système d'alimentation en carburant$$, false, 'synced'),
  ('cat_body', 'Body & Cab Parts', 'Carrosserie et cabine', false, 'synced'),
  ('cat_hardware', 'Hardware & Fasteners', 'Quincaillerie et fixations', false, 'synced'),
  ('cat_safety', 'Safety Gear (PPE)', 'Équipement de sécurité (EPI)', false, 'synced'),
  ('cat_filters', 'Filters', 'Filtres', false, 'synced'),
  ('cat_hydraulics', 'Hydraulics', 'Hydraulique', false, 'synced')
) AS default_categories(id, name_en, name_fr, is_archived, sync_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name_en = default_categories.name_en
);

-- Seed Default Suppliers
INSERT INTO public.suppliers (id, name, is_archived, sync_status)
SELECT * FROM (VALUES
  ('sup_ammars_sarl', 'AMMARS SARL', false, 'synced'),
  ('sup_era_shacman_truck_sarlu', 'ERA SHACMAN TRUCK SARLU', false, 'synced'),
  ('sup_aboubacar_camara', 'ABOUBACAR CAMARA', false, 'synced'),
  ('sup_laye_diarra_kourouma', 'LAYE DIARRA KOUROUMA', false, 'synced'),
  ('sup_mohamed_kante', 'MOHAMED KANTE', false, 'synced'),
  ('sup_kolaboui', 'KOLABOUI', false, 'synced'),
  ('sup_kallo_sarl', 'KALLO SARL', false, 'synced'),
  ('sup_abdoulaye_kaba_frere', 'ABDOULAYE KABA & FRERE', false, 'synced'),
  ('sup_alcotex', 'ALCOTEX', false, 'synced'),
  ('sup_belt_way_sarlu', 'BELT WAY SARLU', false, 'synced'),
  ('sup_abdoulaye_diaby', 'ABDOULAYE DIABY', false, 'synced'),
  ('sup_sekouba_toure', 'SÉKOUBA TOURE', false, 'synced')
) AS default_suppliers(id, name, is_archived, sync_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.suppliers WHERE name = default_suppliers.name
);
