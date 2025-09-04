-- Reivilo B2B Portal - Supabase Schema Migration
-- Production database schema for deployment

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'client');
CREATE TYPE quote_status AS ENUM ('PENDING', 'NOTAUTHORISED', 'AUTHORISED', 'FAILED');

-- Admin Users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers table (cached from Cin7)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp_customer_id VARCHAR(255) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  address TEXT,
  terms VARCHAR(100),
  price_tier VARCHAR(100),
  contacts JSONB,
  cin7_data JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products table (cached from Cin7)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(255),
  brand VARCHAR(255),
  barcode VARCHAR(255),
  default_sell_price DECIMAL(10,2),
  image_url TEXT,
  cin7_data JSONB,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product availability table (real-time stock from Cin7)
CREATE TABLE IF NOT EXISTS product_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(255) NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  on_hand INTEGER DEFAULT 0,
  available INTEGER DEFAULT 0,
  allocated INTEGER DEFAULT 0,
  on_order INTEGER DEFAULT 0,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sku, location_name)
);

-- Warehouses/Locations table (cached from Cin7)
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp_location_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  cin7_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes table (for order tracking)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp_sale_id VARCHAR(255),
  customer_id UUID REFERENCES customers(id),
  status quote_status DEFAULT 'PENDING',
  total_amount DECIMAL(10,2),
  location VARCHAR(255),
  quote_data JSONB,
  cin7_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync status tracking
CREATE TABLE IF NOT EXISTS sync_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type VARCHAR(100) NOT NULL,
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'SUCCESS',
  error_message TEXT,
  records_synced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_product_availability_sku ON product_availability(sku);
CREATE INDEX IF NOT EXISTS idx_product_availability_location ON product_availability(location_name);
CREATE INDEX IF NOT EXISTS idx_customers_erp_id ON customers(erp_customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- Row Level Security (RLS) Policies
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;

-- Admin access policies
CREATE POLICY "Admin full access" ON admin_users FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read availability" ON product_availability FOR SELECT USING (true);
CREATE POLICY "Public read warehouses" ON warehouses FOR SELECT USING (true);

-- Customer-specific policies
CREATE POLICY "Customers can view own data" ON customers 
  FOR SELECT USING (auth.jwt() ->> 'customer_id' = id::text OR auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Customers can view own quotes" ON quotes 
  FOR SELECT USING (auth.jwt() ->> 'customer_id' = customer_id::text OR auth.jwt() ->> 'role' = 'admin');

-- Insert default admin users
INSERT INTO admin_users (email, name, password_hash, role) 
VALUES 
  ('ronald@reiviloindustrial.co.za', 'Ronald', crypt('Ron@Reiv25', gen_salt('bf')), 'admin'),
  ('sales2@reiviloindustrial.co.za', 'Kai', crypt('Kai@Reiv25', gen_salt('bf')), 'admin')
ON CONFLICT (email) DO NOTHING;