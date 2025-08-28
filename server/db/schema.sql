-- CACHED (from Cin7)

create table if not exists products (
  id serial primary key,
  sku text unique not null,
  name text,
  barcode text,
  brand text,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists warehouses (
  id serial primary key,
  cin7_location_name text unique not null
);

create table if not exists availability (
  product_id int references products(id) on delete cascade,
  warehouse_id int references warehouses(id) on delete cascade,
  on_hand numeric default 0,
  allocated numeric default 0,
  available numeric default 0,
  on_order numeric default 0,
  primary key (product_id, warehouse_id)
);

create table if not exists customers (
  id serial primary key,
  erp_customer_id text,            -- Cin7/DEAR ID or Code
  company_name text,
  terms text,
  price_tier text,
  default_address text,
  billing_address text,
  shipping_address text,
  contacts jsonb,                  -- [{name,email,phone,role}, ...]
  updated_at timestamptz default now()
);

-- APP-NATIVE

create table if not exists users (
  id serial primary key,
  customer_id int references customers(id) on delete cascade,
  email text unique not null,
  password text not null,
  role text default 'buyer',
  created_at timestamptz default now()
);

create table if not exists quotes (
  id serial primary key,
  erp_sale_id text,                -- returned by Cin7
  status text,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists logs (
  id serial primary key,
  level text,
  message text,
  meta jsonb,
  created_at timestamptz default now()
);