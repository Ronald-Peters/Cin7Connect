// db.js
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase
});

export const db = {
  query: (text, params) => pool.query(text, params),
};