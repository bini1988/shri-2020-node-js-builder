const https = require('https');
const axios = require('axios');
const {
  apiBaseUrl,
  apiToken,
} = require('../server-conf.json');

const instance = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    Authorization: `Bearer ${apiToken}`,
  },
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

module.exports = {
  /**
   * Получить конфигурацию CI
   * @return {Promise<Object>}
   */
  fetchConfiguration() {
    return instance.get('/conf')
      .then(({ data }) => data.data);
  },
  /**
   * Получить список сборок
   * @return {Promise<Object[]>}
   */
  fetchBuilds() {
    return instance.get('/build/list')
      .then(({ data: { data = [] } }) => data);
  },
  /**
   * Задать сборке статус в процессе выполнения
   * @param {Object} params
   * @param {string} params.buildId Индентификатор сборки
   * @param {string} params.dateTime Время начала сборки
   * @return {Promise}
   */
  startBuild(params) {
    return instance.post('/build/start', params);
  },
  /**
   * Задать сборке статус завершенена
   * @param {Object} params
   * @param {string} params.buildId Индентификатор сборки
   * @param {number} params.duration Время потраченное на сборку
   * @param {boolean} params.success Упесшное завершенние сборки
   * @param {string} params.buildLog Лог сборки
   * @return {Promise}
   */
  finishBuild(params) {
    return instance.post('/build/finish', params);
  },
};
