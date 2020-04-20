const axios = require('axios');
const {
  serverHost,
  serverPort,
} = require('../agent-conf.json');

const baseURL = `http://${serverHost}:${serverPort}`;
const instance = axios.create({ baseURL });

module.exports = {
  baseURL,
  /**
   * Регистрация агента на сервере
   * @param {string} id Индентификатор агента
   * @param {string} host Хост агента
   * @return {Promise}
   */
  notifyAgent(id, host) {
    return instance.post('/notify-agent', { id, host });
  },
  /**
   * Отправить результат работы агента
   * @param {Object} params Результат работы
   * @return {Promise}
   */
  notifyAgentBuild(params) {
    return instance.post('/notify-build-result', params);
  },
};
