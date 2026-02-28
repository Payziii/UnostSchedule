const { API_BASE_URL, daysOfWeek } = require('./config');

async function getScheduleImage(day, group) {
  const course = require('./utils').findCourseByGroup(group);
  if (!course) {
    throw new Error('Course not found');
  }
  const params = new URLSearchParams({
    day,
    group,
    course,
  });
  const response = await fetch(`${API_BASE_URL}/o/schedule?${params}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('image/png')) {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else {
    const data = await response.json();
    throw new Error(data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка');
  }
}

async function getWeekImage(group) {
  const course = require('./utils').findCourseByGroup(group);
  if (!course) {
    throw new Error('Course not found');
  }
  const params = new URLSearchParams({
    group,
    course,
  });
  const response = await fetch(`${API_BASE_URL}/o/week?${params}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('image/png')) {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else {
    const data = await response.json();
    throw new Error(data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка');
  }
}

async function getTodayImage(group) {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    weekday: 'long'
  });
  const todayWeekday = dayFormatter.format(now).toUpperCase();
  const todayIndex = daysOfWeek.indexOf(todayWeekday);
  if (todayIndex === -1) {
    throw new Error(`Неверный день недели: ${todayWeekday}`);
  }
  const day = daysOfWeek[todayIndex];
  return await getScheduleImage(day, group);
}

async function getTomorrowImage(group) {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    weekday: 'long'
  });
  const todayWeekday = dayFormatter.format(now).toUpperCase();
  const todayIndex = daysOfWeek.indexOf(todayWeekday);
  if (todayIndex === -1) {
    throw new Error(`Неверный день недели: ${todayWeekday}`);
  }
  const tomorrowIndex = (todayIndex + 1) % 7;
  const day = daysOfWeek[tomorrowIndex];
  return await getScheduleImage(day, group);
}

module.exports = {
  getScheduleImage,
  getWeekImage,
  getTodayImage,
  getTomorrowImage
};