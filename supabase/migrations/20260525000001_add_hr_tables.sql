-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    salary REAL NOT NULL DEFAULT 0,
    hire_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('active', 'inactive', 'on_leave')) DEFAULT 'active',
    performance_notes TEXT,
    resume_text TEXT,
    is_archived BOOLEAN DEFAULT false,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Policies for employees
CREATE POLICY "Enable read access for all authenticated users" ON employees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for all authenticated users" ON employees FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for all authenticated users" ON employees FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for all authenticated users" ON employees FOR DELETE USING (auth.role() = 'authenticated');

-- Create applicants table
CREATE TABLE IF NOT EXISTS applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role_applied TEXT NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 0,
    skills TEXT,
    resume_text TEXT,
    ai_score REAL DEFAULT 0,
    ai_assessment TEXT,
    status TEXT CHECK(status IN ('pending', 'reviewed', 'interviewed', 'accepted', 'rejected')) DEFAULT 'pending',
    is_archived BOOLEAN DEFAULT false,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    applied_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for applicants
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;

-- Policies for applicants
CREATE POLICY "Enable read access for all authenticated users" ON applicants FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for all authenticated users" ON applicants FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for all authenticated users" ON applicants FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for all authenticated users" ON applicants FOR DELETE USING (auth.role() = 'authenticated');
