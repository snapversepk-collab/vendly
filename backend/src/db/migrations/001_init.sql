-- Vendly schema. Every table except users carries business_id; the API filters
-- every query by the signed-in member's business_id.
-- Money: whole rupees (integer). Dates: date, times: time, Asia/Karachi.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  password_hash text,
  google_sub text UNIQUE,
  appearance text NOT NULL DEFAULT 'system' CHECK (appearance IN ('light','dark','system')),
  reset_token text,
  reset_expires timestamptz,
  invite_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  handle text UNIQUE,
  whatsapp text,
  email text,
  cities text[] NOT NULL DEFAULT '{}',
  trades text[] NOT NULL DEFAULT '{}',
  capacity_per_date int NOT NULL DEFAULT 1 CHECK (capacity_per_date >= 1),
  advance_pct int NOT NULL DEFAULT 40 CHECK (advance_pct BETWEEN 0 AND 100),
  balance_due text NOT NULL DEFAULT 'event_day' CHECK (balance_due IN ('event_day','before_event')),
  reschedule_notice_days int NOT NULL DEFAULT 7,
  payment_methods text[] NOT NULL DEFAULT '{cash,bank,jazzcash,easypaisa}',
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','team')),
  logo text,
  receipt_prefix text NOT NULL DEFAULT 'RC',
  receipt_seq int NOT NULL DEFAULT 0,
  setup_done jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','manager','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  trade text,
  hours numeric(4,1),
  price int,
  includes text,
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS services_business ON services(business_id);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  whatsapp text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_business ON clients(business_id);

CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  family_id uuid REFERENCES families(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES clients(id),
  function_type text NOT NULL,
  date date NOT NULL,
  start_time time,
  hours numeric(4,1),
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  venue text,
  city text,
  status text NOT NULL DEFAULT 'inquiry' CHECK (status IN ('inquiry','confirmed','completed','cancelled')),
  total int NOT NULL DEFAULT 0 CHECK (total >= 0),
  advance_pct int NOT NULL DEFAULT 40,
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','booking_page','import')),
  assigned_user_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_business_date ON bookings(business_id, date);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount int NOT NULL,
  received_on date NOT NULL,
  method text NOT NULL,
  note text,
  receipt_no text NOT NULL,
  receipt_token text NOT NULL UNIQUE,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_booking ON payments(booking_id);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  lines jsonb NOT NULL DEFAULT '[]',
  advance_pct int NOT NULL DEFAULT 40,
  hold_until date,
  note text,
  token text NOT NULL UNIQUE,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_booking ON quotes(booking_id);

CREATE TABLE IF NOT EXISTS inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  whatsapp text NOT NULL,
  email text,
  function_type text NOT NULL,
  date date NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  venue text,
  city text,
  guests int,
  message text,
  suggested_dates date[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','quoted','suggested','declined')),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiries_business ON inquiries(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trade text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  UNIQUE (business_id, trade)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label text NOT NULL,
  phase text NOT NULL DEFAULT 'Before',
  done boolean NOT NULL DEFAULT false,
  auto text CHECK (auto IN ('advance','balance')),
  sort int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_booking ON checklist_items(booking_id);

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  name text NOT NULL,
  text text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  timing text,
  UNIQUE (business_id, kind, channel)
);

CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  ref_id uuid,
  kind text NOT NULL,
  "to" text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  provider_id text,
  status text NOT NULL
);
-- never send the same kind for the same booking (or payment / inquiry ref) twice
CREATE UNIQUE INDEX IF NOT EXISTS email_log_once ON email_log(business_id, kind, COALESCE(booking_id::text,''), COALESCE(ref_id::text,''));
