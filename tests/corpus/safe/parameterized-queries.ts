// Safe: Parameterized SQL queries
// Expected: NO detections

import { db } from './database';

export async function getUser(userId: number) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);  // Safe
  return result.rows[0];
}

export async function searchProducts(term: string) {
  const result = await db.query(
    'SELECT * FROM products WHERE name ILIKE $1',  // Safe
    [`%${term}%`]
  );
  return result.rows;
}
