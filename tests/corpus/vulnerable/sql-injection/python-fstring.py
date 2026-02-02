# SQL Injection via f-string interpolation
# Expected: sql-injection at lines 8, 14

import sqlite3

def get_user(user_id: str):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")  # Line 8: VULNERABLE
    return cursor.fetchone()

def get_order(order_id: str):
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM orders WHERE id = {order_id}")  # Line 14: VULNERABLE
    return cursor.fetchone()
