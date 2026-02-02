// SQL Injection via template literal
// Expected: sql-injection at lines 6, 12

import { db } from './database';

export async function getUser(userId: string) {
  const result = await db.query(`SELECT * FROM users WHERE id = '${userId}'`);  // Line 6: VULNERABLE
  return result.rows[0];
}

export async function searchProducts(term: string) {
  const sql = `SELECT * FROM products WHERE name LIKE '%${term}%'`;  // Line 12: VULNERABLE
  return db.query(sql);
}
