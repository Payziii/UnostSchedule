const { InlineKeyboard, Keyboard } = require('grammy');
const { GROUPS_CONFIG, GRADUATED_COURSE } = require('./config');

const courseKeyboard = () => {
  const keyboard = new InlineKeyboard();
  Object.keys(GROUPS_CONFIG).forEach((course) => {
    if (course === GRADUATED_COURSE) return;
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

const gradCourseKeyboard = () => {
  const keyboard = new InlineKeyboard();
  Object.keys(GROUPS_CONFIG).forEach((course) => {
    if (course === GRADUATED_COURSE) return;
    keyboard.text(`${course} курс`, `grad_course_${course}`).row();
  });
  keyboard.text('Отмена', 'grad_cancel');
  return keyboard;
};

const gradGroupKeyboard = (course) => {
  const keyboard = new InlineKeyboard();
  GROUPS_CONFIG[course].forEach((group, index) => {
    keyboard.text(group, `grad_group_${course}_${index}`).row();
  });
  keyboard.text('Отмена', 'grad_cancel');
  return keyboard;
};

const mainKeyboard = () => {
  return new Keyboard()
    .text('🗓️ Сегодня').text('🗓️ Неделя').text('🗓️ Завтра').row()
    .text('👤 Профиль').text('📊 Инфо')
    .resized()
    .persistent();
};

module.exports = { courseKeyboard, groupKeyboard, gradCourseKeyboard, gradGroupKeyboard, mainKeyboard };
