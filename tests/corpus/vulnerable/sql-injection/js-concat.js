// SQL Injection via concatenation
// Expected: sql-injection at lines 6, 12

const db = require('./database');

function getUser(userId) {
  return db.query("SELECT * FROM users WHERE id = '" + userId + "'");  // Line 6: VULNERABLE
}

function updateUser(userId, name) {
  const query = "UPDATE users SET name = '" + name + "' WHERE id = " + userId;  // Line 12: VULNERABLE
  return db.query(query);
}

module.exports = { getUser, updateUser };
