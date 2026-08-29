const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      course TEXT,
      group_name TEXT,
      terms_accepted INTEGER NOT NULL DEFAULT 0,
      promo_notifications INTEGER NOT NULL DEFAULT 1,
      system_notifications INTEGER NOT NULL DEFAULT 1
    )
  `);
  // Миграция для баз, созданных до появления условий использования
  db.run(`ALTER TABLE users ADD COLUMN terms_accepted INTEGER NOT NULL DEFAULT 0`, (err) => {
    if (err && !/duplicate column name/i.test(err.message)) {
      console.error('Ошибка миграции terms_accepted:', err.message);
    }
  });
  // Миграция для добавления настроек уведомлений
  db.run(`ALTER TABLE users ADD COLUMN promo_notifications INTEGER NOT NULL DEFAULT 1`, (err) => {
    if (err && !/duplicate column name/i.test(err.message)) {
      console.error('Ошибка миграции promo_notifications:', err.message);
    }
  });
  db.run(`ALTER TABLE users ADD COLUMN system_notifications INTEGER NOT NULL DEFAULT 1`, (err) => {
    if (err && !/duplicate column name/i.test(err.message)) {
      console.error('Ошибка миграции system_notifications:', err.message);
    }
  });
});

const getUser = (userId) => new Promise((resolve, reject) => {
  db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const saveUser = (userId, course, group) => new Promise((resolve, reject) => {
  db.run(
    `INSERT INTO users (user_id, course, group_name) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET course = excluded.course, group_name = excluded.group_name`,
    [userId, course, group],
    (err) => {
      if (err) return reject(err);
      resolve();
    }
  );
});

const hasAcceptedTerms = (userId) => new Promise((resolve, reject) => {
  db.get(`SELECT terms_accepted FROM users WHERE user_id = ?`, [userId], (err, row) => {
    if (err) return reject(err);
    resolve(!!row && row.terms_accepted === 1);
  });
});

const setTermsAccepted = (userId, accepted) => new Promise((resolve, reject) => {
  db.run(
    `INSERT INTO users (user_id, terms_accepted) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET terms_accepted = excluded.terms_accepted`,
    [userId, accepted ? 1 : 0],
    (err) => {
      if (err) return reject(err);
      resolve();
    }
  );
});

const deleteUser = (userId) => new Promise((resolve, reject) => {
  db.run(`UPDATE users SET course = NULL, group_name = NULL WHERE user_id = ?`, [userId], (err) => {
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

const getUsersByFilter = (filter = {}, notificationType = null) => new Promise((resolve, reject) => {
  let query = 'SELECT user_id FROM users WHERE group_name IS NOT NULL';
  const params = [];

  // Фильтр по типу уведомлений (если не обязательная рассылка)
  if (notificationType === 'promo') {
    query += ' AND promo_notifications = 1';
  } else if (notificationType === 'system') {
    query += ' AND system_notifications = 1';
  }
  // Если notificationType === 'mandatory', то без фильтра по уведомлениям

  if (filter.course) {
    query += ' AND course = ?';
    params.push(filter.course);
  } else if (filter.group_name) {
    query += ' AND group_name = ?';
    params.push(filter.group_name);
  }

  db.all(query, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const countUsersByFilter = (filter = {}, notificationType = null) => new Promise((resolve, reject) => {
  let query = 'SELECT COUNT(*) as count FROM users WHERE group_name IS NOT NULL';
  const params = [];

  // Фильтр по типу уведомлений
  if (notificationType === 'promo') {
    query += ' AND promo_notifications = 1';
  } else if (notificationType === 'system') {
    query += ' AND system_notifications = 1';
  }

  if (filter.course) {
    query += ' AND course = ?';
    params.push(filter.course);
  } else if (filter.group_name) {
    query += ' AND group_name = ?';
    params.push(filter.group_name);
  }

  db.get(query, params, (err, row) => {
    if (err) return reject(err);
    resolve(row ? row.count : 0);
  });
});

const getStats = () => new Promise((resolve, reject) => {
  const result = {};
  db.get('SELECT COUNT(*) as count FROM users WHERE group_name IS NOT NULL', (err, row) => {
    if (err) return reject(err);
    result.total = row.count;
    db.get('SELECT COUNT(*) as count FROM users WHERE terms_accepted = 1', (err, row) => {
      if (err) return reject(err);
      result.termsAccepted = row.count;
      db.all('SELECT course, COUNT(*) as count FROM users WHERE group_name IS NOT NULL GROUP BY course', (err, rows) => {
        if (err) return reject(err);
        result.byCourse = rows;
        db.all('SELECT course, group_name, COUNT(*) as count FROM users WHERE group_name IS NOT NULL GROUP BY course, group_name ORDER BY count DESC LIMIT 10', (err, rows) => {
          if (err) return reject(err);
          result.byGroup = rows;
          resolve(result);
        });
      });
    });
  });
});

const graduateCourse = (fromCourse, toCourse, toGroup) => new Promise((resolve, reject) => {
  db.run(
    `UPDATE users SET course = ?, group_name = ? WHERE course = ?`,
    [toCourse, toGroup, fromCourse],
    function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    }
  );
});

const graduateGroup = (fromGroup, toCourse, toGroup) => new Promise((resolve, reject) => {
  db.run(
    `UPDATE users SET course = ?, group_name = ? WHERE group_name = ?`,
    [toCourse, toGroup, fromGroup],
    function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    }
  );
});

const promoteGroup = (fromGroup, toCourse, toGroup) => new Promise((resolve, reject) => {
  db.run(
    `UPDATE users SET course = ?, group_name = ? WHERE group_name = ?`,
    [toCourse, toGroup, fromGroup],
    function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    }
  );
});

const toggleNotification = (userId, type) => new Promise((resolve, reject) => {
  const column = type === 'promo' ? 'promo_notifications' : 'system_notifications';
  db.get(`SELECT ${column} FROM users WHERE user_id = ?`, [userId], (err, row) => {
    if (err) return reject(err);
    const currentValue = row ? row[column] : 1;
    const newValue = currentValue === 1 ? 0 : 1;
    db.run(
      `INSERT INTO users (user_id, ${column}) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${column} = excluded.${column}`,
      [userId, newValue],
      (err) => {
        if (err) return reject(err);
        resolve(newValue);
      }
    );
  });
});

module.exports = {
  db,
  getUser,
  saveUser,
  deleteUser,
  getUsersByGroup,
  getUsersByFilter,
  countUsersByFilter,
  getStats,
  graduateCourse,
  graduateGroup,
  promoteGroup,
  hasAcceptedTerms,
  setTermsAccepted,
  toggleNotification,
};
