const { API_BASE_URL, daysOfWeek } = require('./config');
const groups = require('./groups.json');

const allGroups = [].concat(...Object.values(groups));

const findCourseByGroup = (group) => {
  for (const course in groups) {
    if (groups[course].includes(group)) return course;
  }
  return null;
};

const fetchScheduleImage = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('image/png')) {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  const data = await response.json();
  throw new Error(data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка');
};

const getScheduleImage = async (day, group) => {
  const course = findCourseByGroup(group);
  if (!course) throw new Error('Course not found');
  const params = new URLSearchParams({ day, group, course });
  return fetchScheduleImage(`${API_BASE_URL}/o/schedule?${params}`);
};

const getWeekImage = async (group, extraParams = {}) => {
  const course = findCourseByGroup(group);
  if (!course) throw new Error('Course not found');
  const params = new URLSearchParams({ group, course, ...extraParams });
  return fetchScheduleImage(`${API_BASE_URL}/o/week?${params}`);
};

const getQueryImage = async (query) => {
  const params = new URLSearchParams({ query });
  return fetchScheduleImage(`${API_BASE_URL}/o/search?${params}`);
};

const getRaspImage = async () => {
  return fetchScheduleImage(`${API_BASE_URL}/o/rasp`);
};

const getTodayDayName = () => {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    weekday: 'long'
  });
  return formatter.format(new Date()).toUpperCase();
};

const getTodayImage = async (group) => {
  const day = getTodayDayName();
  if (!daysOfWeek.includes(day)) throw new Error(`Неверный день недели: ${day}`);
  return getScheduleImage(day, group);
};

const getTomorrowImage = async (group) => {
  const today = getTodayDayName();
  const todayIndex = daysOfWeek.indexOf(today);
  if (todayIndex === -1) throw new Error(`Неверный день недели: ${today}`);
  const tomorrowDay = daysOfWeek[(todayIndex + 1) % 7];
  return getScheduleImage(tomorrowDay, group);
};

module.exports = {
  allGroups,
  findCourseByGroup,
  getScheduleImage,
  getWeekImage,
  getQueryImage,
  getRaspImage,
  getTodayImage,
  getTomorrowImage,
  getTodayDayName,
};
