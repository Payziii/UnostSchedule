const { groups } = require('./config');

const findCourseByGroup = (group) => {
  for (const course in groups) {
    if (groups[course].includes(group)) {
      return course;
    }
  }
  return null;
};

const isAdmin = (userId) => require('./config').ADMIN_IDS.includes(userId);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

module.exports = {
  findCourseByGroup,
  isAdmin,
  sleep
};