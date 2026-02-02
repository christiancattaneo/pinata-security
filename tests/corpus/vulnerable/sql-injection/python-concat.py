# SQL Injection via string concatenation
# Expected: sql-injection at lines 9, 15

import sqlite3

def search_users(name: str):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE name = '" + name + "'"  # Line 9: VULNERABLE
    cursor.execute(query)
    return cursor.fetchall()

def delete_user(user_id: str):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = " + user_id)  # Line 15: VULNERABLE
    conn.commit()
