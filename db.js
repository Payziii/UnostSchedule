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
      system_notifications INTEGER NOT NULL DEFAULT 1,
      schedule_change_notifications INTEGER NOT NULL DEFAULT 1
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
  db.run(`ALTER TABLE users ADD COLUMN schedule_change_notifications INTEGER NOT NULL DEFAULT 1`, (err) => {
    if (err && !/duplicate column name/i.test(err.message)) {
      console.error('Ошибка миграции schedule_change_notifications:', err.message);
    }
  });

    db.run(`
    CREATE TABLE IF NOT EXISTS schedule_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      view_type TEXT NOT NULL,
      viewed_at INTEGER NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_views_group ON schedule_views (group_name, viewed_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_views_user ON schedule_views (user_id, viewed_at)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_changes_group ON schedule_changes (group_name, changed_at)`);
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
        db.all('SELECT course, group_name, COUNT(*) as count FROM users WHERE group_name IS NOT NULL GROUP BY course, group_name ORDER BY count DESC LIMIT 100', (err, rows) => {
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
  const columnMap = {
    'promo': 'promo_notifications',
    'system': 'system_notifications',
    'schedule': 'schedule_change_notifications'
  };
  const column = columnMap[type];

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

const TZ_MODIFIER = '+5 hours';

const dbGet = (q, p = []) => new Promise((res, rej) => db.get(q, p, (e, r) => (e ? rej(e) : res(r))));
const dbAll = (q, p = []) => new Promise((res, rej) => db.all(q, p, (e, r) => (e ? rej(e) : res(r))));

// viewType: 'today' | 'tomorrow' | 'week'
const logView = (userId, groupName, viewType) => new Promise((resolve, reject) => {
  db.run(
    `INSERT INTO schedule_views (user_id, group_name, view_type, viewed_at) VALUES (?, ?, ?, ?)`,
    [userId, groupName, viewType, Math.floor(Date.now() / 1000)],
    (err) => (err ? reject(err) : resolve())
  );
});

const logScheduleChange = (groupName) => new Promise((resolve, reject) => {
  db.run(
    `INSERT INTO schedule_changes (group_name, changed_at) VALUES (?, ?)`,
    [groupName, Math.floor(Date.now() / 1000)],
    (err) => (err ? reject(err) : resolve())
  );
});

// since/until - unix-секунды, чтобы считать за учебный год или любой другой период
const getGroupWrapped = async (groupName, since = 0, until = 4102444800) => {
  const range = [groupName, since, until];
  const [total, byType, byHour, changes] = await Promise.all([
    dbGet(`SELECT COUNT(*) AS count FROM schedule_views WHERE group_name = ? AND viewed_at BETWEEN ? AND ?`, range),
    dbAll(`SELECT view_type, COUNT(*) AS count FROM schedule_views WHERE group_name = ? AND viewed_at BETWEEN ? AND ? GROUP BY view_type`, range),
    dbAll(
      `SELECT CAST(strftime('%H', viewed_at, 'unixepoch', ?) AS INTEGER) AS hour, COUNT(*) AS count
       FROM schedule_views WHERE group_name = ? AND viewed_at BETWEEN ? AND ?
       GROUP BY hour ORDER BY hour`,
      [TZ_MODIFIER, ...range]
    ),
    dbGet(`SELECT COUNT(*) AS count FROM schedule_changes WHERE group_name = ? AND changed_at BETWEEN ? AND ?`, range),
  ]);
  return { total: total.count, byType, byHour, changes: changes.count };
};

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
  logView,
  logScheduleChange,
  getGroupWrapped,
};
