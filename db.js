const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db');

const getUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const saveUser = (userId, course, group) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO users (user_id, course, group_name) VALUES (?, ?, ?)`,
      [userId, course, group],
      (err) => {
        if (err) reject(err);
        resolve();
      }
    );
  });
};

const deleteUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM users WHERE user_id = ?`, [userId], (err) => {
      if (err) reject(err);
      resolve();
    });
  });
};

const getUsersByGroup = (groupName) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT user_id FROM users WHERE group_name = ?`, [groupName], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const getUsersByFilter = (filter = {}) => {
  return new Promise((resolve, reject) => {
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
};

module.exports = {
  db,
  getUser,
  saveUser,
  deleteUser,
  getUsersByGroup,
  getUsersByFilter
};