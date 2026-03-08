const { InlineKeyboard } = require('grammy');
const { GROUPS_CONFIG } = require('./config');

const courseKeyboard = () => {
  const keyboard = new InlineKeyboard();
  Object.keys(GROUPS_CONFIG).forEach((course) => {
    keyboard.text(course, `course_${course}`).row();
  });
  return keyboard;
};

const groupKeyboard = (course) => {
  const keyboard = new InlineKeyboard();
  GROUPS_CONFIG[course].forEach((group) => {
    keyboard.text(group, `group_${course}_${group}`).row();
  });
  return keyboard;
};

module.exports = { courseKeyboard, groupKeyboard };
