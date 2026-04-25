-- SUPABASE SCHEMA FOR HD MANAGEMENT SYSTEM

-- 1. Admins table
CREATE TABLE IF NOT EXISTS admins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  added_by text,
  created_at timestamptz DEFAULT now()
);

-- 2. Employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  added_by text,
  created_at timestamptz DEFAULT now()
);

-- 3. Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  added_by text,
  created_at timestamptz DEFAULT now()
);

-- Seed common tasks
INSERT INTO tasks (name) VALUES 
('SDP'),
('DELTA'),
('GCASH'),
('ELOAD')
ON CONFLICT (name) DO NOTHING;

-- 4. Assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_name text NOT NULL,
  duty_from date NOT NULL,
  duty_to date NOT NULL,
  date_assigned date DEFAULT CURRENT_DATE,
  added_by text,
  created_at timestamptz DEFAULT now()
);

-- 5. Assignment Employees (Many-to-Many junction)
CREATE TABLE IF NOT EXISTS assignment_employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES assignments(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 6. Shift Types
CREATE TABLE IF NOT EXISTS shift_types (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer DEFAULT 0
);

-- Seed Shift Types
INSERT INTO shift_types (name, sort_order) VALUES 
('6am-3pm', 1),
('8am-5pm', 2),
('10pm-6am', 3)
ON CONFLICT (name) DO NOTHING;

-- 7. Schedule Entries (Shifts)
CREATE TABLE IF NOT EXISTS schedule_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_date date NOT NULL,
  shift_type_id integer REFERENCES shift_types(id),
  employee_name text NOT NULL,
  added_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(schedule_date, shift_type_id, employee_name)
);

-- 8. Leave Entries (Dayoff, PAL, SL, HD)
CREATE TABLE IF NOT EXISTS leave_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_date date NOT NULL,
  employee_name text NOT NULL,
  leave_type text NOT NULL, -- 'Dayoff', 'Pre Approved Leave', 'Sick Leave', 'Half Day'
  added_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(schedule_date, employee_name, leave_type)
);

-- 9. Soft Skills Trainings
CREATE TABLE IF NOT EXISTS soft_skills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL,
  row_num integer NOT NULL,
  content text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(year, month, row_num)
);

-- 10. Persistent Notes
CREATE TABLE IF NOT EXISTS notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key text NOT NULL,
  row_idx integer NOT NULL,
  row_data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section_key, row_idx)
);

-- RLS POLICIES (Simplified for this app flow - Enable RLS but allow shared access)
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE soft_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Creating a single common policy for shared usage (as per app logic)
CREATE POLICY "Enable all access for all users" ON admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON assignment_employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON shift_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON schedule_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON leave_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON soft_skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON notes FOR ALL USING (true) WITH CHECK (true);
