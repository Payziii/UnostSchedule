const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      course TEXT,
      group_name TEXT
    )
  `);
});

const getUser = (userId) => new Promise((resolve, reject) => {
  db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const saveUser = (userId, course, group) => new Promise((resolve, reject) => {
  db.run(
    `INSERT OR REPLACE INTO users (user_id, course, group_name) VALUES (?, ?, ?)`,
    [userId, course, group],
    (err) => {
      if (err) return reject(err);
      resolve();
    }
  );
});

const deleteUser = (userId) => new Promise((resolve, reject) => {
  db.run(`DELETE FROM users WHERE user_id = ?`, [userId], (err) => {
    if (err) return reject(err);
    resolve();
  });
});

const getUsersByGroup = (groupName) => new Promise((resolve, reject) => {
  db.all(`SELECT user_id FROM users WHERE group_name = ?`, [groupName], (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const getUsersByFilter = (filter = {}) => new Promise((resolve, reject) => {
  let query = 'SELECT user_id FROM users';
  const params = [];
  if (filter.course) {
    query += ' WHERE course = ?';
    params.push(filter.course);
  } else if (filter.group_name) {
    query += ' WHERE group_name = ?';
    params.push(filter.group_name);
  }
  db.all(query, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const getStats = () => new Promise((resolve, reject) => {
  const result = {};
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (err) return reject(err);
    result.total = row.count;
    db.all('SELECT course, COUNT(*) as count FROM users GROUP BY course', (err, rows) => {
      if (err) return reject(err);
      result.byCourse = rows;
      db.all('SELECT group_name, COUNT(*) as count FROM users GROUP BY group_name ORDER BY count DESC LIMIT 10', (err, rows) => {
        if (err) return reject(err);
        result.byGroup = rows;
        resolve(result);
      });
    });
  });
});

module.exports = { db, getUser, saveUser, deleteUser, getUsersByGroup, getUsersByFilter, getStats };
