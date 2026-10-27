const { API_BASE_URL, daysOfWeek, GRADUATED_COURSE } = require('./config');
const groups = require('./groups.json');

const scheduleCourses = Object.keys(groups).filter(course => course !== GRADUATED_COURSE);

const allGroups = [].concat(...scheduleCourses.map(course => groups[course]));

const findCourseByGroup = (group) => {
  for (const course of scheduleCourses) {
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

const getScheduleImage = async (day, group, extraParams = {}) => {
  const course = findCourseByGroup(group);
  if (!course) throw new Error('Course not found');
  const params = new URLSearchParams();
  params.set('day', day);
  params.set('group', group);
  params.set('course', course);
  if (extraParams && typeof extraParams === 'object') {
    for (const [key, val] of Object.entries(extraParams)) {
      if (val !== undefined && val !== null) {
        params.set(key, val);
      }
    }
  }
  return fetchScheduleImage(`${API_BASE_URL}/o/schedule?${params}`);
};

const getWeekImage = async (group, extraParams = {}) => {
  const course = findCourseByGroup(group);
  if (!course) throw new Error('Course not found');
  const params = new URLSearchParams();
  params.set('group', group);
  params.set('course', course);
  if (extraParams && typeof extraParams === 'object') {
    for (const [key, val] of Object.entries(extraParams)) {
      if (val !== undefined && val !== null) {
        params.set(key, val);
      }
    }
  }
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

const getTodayImage = async (group, extraParams = {}) => {
  const day = getTodayDayName();
  if (!daysOfWeek.includes(day)) throw new Error(`Неверный день недели: ${day}`);
  return getScheduleImage(day, group, extraParams);
};

const getTomorrowImage = async (group, extraParams = {}) => {
  const today = getTodayDayName();
  const todayIndex = daysOfWeek.indexOf(today);
  if (todayIndex === -1) throw new Error(`Неверный день недели: ${today}`);
  const tomorrowDay = daysOfWeek[(todayIndex + 1) % 7];
  return getScheduleImage(tomorrowDay, group, extraParams);
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
