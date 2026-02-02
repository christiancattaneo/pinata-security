# Safe: Parameterized SQL queries
# Expected: NO detections

import sqlite3

def get_user(user_id: int):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))  # Safe: parameterized
    return cursor.fetchone()

def search_users(name: str):
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE name LIKE ?", (f"%{name}%",))  # Safe: parameterized
    return cursor.fetchall()

def insert_user(name: str, email: str):
    cursor.execute(
        "INSERT INTO users (name, email) VALUES (?, ?)",  # Safe: parameterized
        (name, email)
    )
