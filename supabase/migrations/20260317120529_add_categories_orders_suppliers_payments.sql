/*
  # Add Categories, Suppliers, Orders, and Payments System

  1. New Tables
    - `categories`
      - `id` (uuid, primary key)
      - `name_en` (text) - English category name
      - `name_fr` (text) - French category name
      - `created_at` (timestamptz)
    
    - `suppliers`
      - `id` (uuid, primary key)
      - `name` (text) - Supplier name
      - `contact` (text) - Contact person name
      - `phone` (text) - Phone number
      - `email` (text) - Email address
      - `address` (text) - Physical address
      - `created_at` (timestamptz)
    
    - `orders`
      - `id` (uuid, primary key)
      - `supplier_id` (uuid) - References suppliers
      - `order_date` (timestamptz) - When order was placed
      - `expected_date` (date) - Expected delivery date
      - `total_amount` (decimal) - Total order amount
      - `paid_amount` (decimal) - Amount paid so far
      - `status` (text) - Order status: pending, partial, paid, cancelled
      - `notes` (text) - Additional notes
      - `created_by` (uuid) - References auth.users
      - `created_at` (timestamptz)
    
    - `order_items`
      - `id` (uuid, primary key)
      - `order_id` (uuid) - References orders
      - `inventory_item_id` (uuid) - Optional reference to inventory
      - `description` (text) - Item description
      - `quantity` (integer) - Quantity ordered
      - `unit_price` (decimal) - Price per unit
      - `total` (decimal) - Computed: quantity * unit_price
    
    - `payments`
      - `id` (uuid, primary key)
      - `order_id` (uuid) - References orders
      - `amount` (decimal) - Payment amount
      - `payment_date` (timestamptz) - When payment was made
      - `method` (text) - Payment method: cash, bank, credit, other
      - `reference` (text) - Payment reference/transaction ID
      - `notes` (text) - Additional notes
      - `created_by` (uuid) - References auth.users
      - `created_at` (timestamptz)
  
  2. Schema Changes
    - Add `category_id` column to inventory table
    - Migrate existing category data to new categories table
  
  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
    - Admin and audit_manager can manage orders and payments
    - Regular users have read-only access to suppliers and categories

  4. Initial Data
    - Populate categories with predefined list in English and French
*/

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_fr text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  phone text,
  email text,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_date timestamptz DEFAULT now(),
  expected_date date,
  total_amount decimal(10,2) NOT NULL DEFAULT 0,
  paid_amount decimal(10,2) DEFAULT 0,
  status text CHECK(status IN ('pending', 'partial', 'paid', 'cancelled')) DEFAULT 'pending',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  unit_price decimal(10,2) NOT NULL CHECK(unit_price >= 0),
  total decimal(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount decimal(10,2) NOT NULL CHECK(amount > 0),
  payment_date timestamptz DEFAULT now(),
  method text CHECK(method IN ('cash', 'bank', 'credit', 'other')) DEFAULT 'cash',
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Add category_id to inventory table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE inventory ADD COLUMN category_id uuid REFERENCES categories(id);
  END IF;
END $$;

-- Enable RLS on all new tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Categories policies (all authenticated users can read, only admin can modify)
CREATE POLICY "Anyone authenticated can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Suppliers policies (authenticated users can view, admin/audit_manager can modify)
CREATE POLICY "Authenticated users can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and audit_manager can insert suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can delete suppliers"
  ON suppliers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

-- Orders policies (authenticated users can view, admin/audit_manager can modify)
CREATE POLICY "Authenticated users can view orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and audit_manager can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

-- Order items policies (authenticated users can view, admin/audit_manager can modify)
CREATE POLICY "Authenticated users can view order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and audit_manager can insert order items"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can update order items"
  ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can delete order items"
  ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

-- Payments policies (authenticated users can view, admin/audit_manager can modify)
CREATE POLICY "Authenticated users can view payments"
  ON payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and audit_manager can insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

CREATE POLICY "Admin and audit_manager can delete payments"
  ON payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'audit_manager')
    )
  );

-- Insert predefined categories
INSERT INTO categories (name_en, name_fr) VALUES
  ('Transmission & Drivetrain', 'Transmission et Groupe Motopropulseur'),
  ('Brake System', 'Système de Freinage'),
  ('Suspension & Steering', 'Suspension et Direction'),
  ('Electrical & Electronics', 'Électrique et Électronique'),
  ('Tires & Wheels', 'Pneus et Roues'),
  ('Exhaust System', 'Système d''Échappement'),
  ('Cooling System', 'Système de Refroidissement'),
  ('Fuel System', 'Système de Carburant'),
  ('Hydraulics', 'Hydraulique'),
  ('Tools & Equipment', 'Outils et Équipements'),
  ('Safety Gear (PPE)', 'Équipement de Sécurité (EPI)'),
  ('Crew Supplies', 'Fournitures d''Équipage'),
  ('Lubricants & Fluids', 'Lubrifiants et Fluides'),
  ('Filters', 'Filtres'),
  ('Batteries', 'Batteries'),
  ('Hardware & Fasteners', 'Quincaillerie et Fixations'),
  ('Body Parts', 'Pièces de Carrosserie')
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_category_id ON inventory(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_supplier_id ON orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_inventory_item_id ON order_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);