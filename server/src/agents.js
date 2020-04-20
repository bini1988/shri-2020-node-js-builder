/* eslint-disable class-methods-use-this */
const axios = require('axios');
const moment = require('moment');
const Queue = require('./queue');

class Agents {
  constructor() {
    this.agents = new Map();
    this.agentsIds = new Queue();
  }

  log(message) {
    const timestamp = moment().format('H:mm:ss');
    console.log(`[Agents][${timestamp}] ${message}`);
  }

  /**
   * Зарегистрировать агента
   * @param {string} id Индентификатор агента
   * @param {string} host Хост агента
   */
  register(id, host) {
    this.agentsIds.enqueue(id);
    this.agents.set(id, { id, host });
    this.log(`Agent ${id} was registered`);
  }

  free(id) {
    if (this.agents.has(id)) {
      const agent = this.agents.get(id);
      agent.task = null;
      this.agentsIds.enqueue(agent.id);
    }
  }

  /**
   * Ожидаем свободных агентов
   */
  async waitAvailables() {
    const AGENS_ENQUEUE_TIMEOUT = 8000;

    if (this.agentsIds.size) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.log('Waiting available agent...');
      setTimeout(() => {
        resolve(this.waitAvailables());
      }, AGENS_ENQUEUE_TIMEOUT);
    });
  }

  /**
   * Назначить свободному агенту задачу
   * @param {Object} build Параметры сборки
   * @param {Object} config Конфигурация
   */
  async assing(build, config) {
    if (!this.agentsIds.size) {
      throw new Error('No available agents');
    }

    const agentId = this.agentsIds.dequeue();
    const agent = this.agents.get(agentId);
    const { repoName, buildCommand, mainBranch } = config;
    const { id: buildId, commitHash, branchName = mainBranch } = build;

    agent.task = {
      buildId, repoName, branchName, commitHash, buildCommand,
    };

    return axios.post(`${agent.host}/build`, agent.task)
      .then(({ data }) => data);
  }
}

module.exports = Agents;
