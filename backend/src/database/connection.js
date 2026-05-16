import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'material_stock_monitoring',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initializeDatabase() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('Database connected at:', result.rows[0].now);
    client.release();
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

// ACID Transaction helper for Material Budget/Stock updates
export async function executeTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Query helper
export async function query(text, params = []) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

// Get single row
export async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

// Get all rows
export async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

// Insert and return
export async function insert(table, data) {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    RETURNING *
  `;
  
  return queryOne(sql, values);
}

// Update and return
export async function update(table, id, data) {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
  
  const sql = `
    UPDATE ${table}
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${columns.length + 1}
    RETURNING *
  `;
  
  return queryOne(sql, [...values, id]);
}

// Delete
export async function deleteRecord(table, id) {
  const sql = `DELETE FROM ${table} WHERE id = $1`;
  return query(sql, [id]);
}

export { pool };
