/* eslint-disable consistent-return */
/* eslint-disable class-methods-use-this */
const axios = require('axios');
const moment = require('moment');
const Queue = require('./queue');

class Pool {
  constructor() {
    this.pool = new Queue();
    this.builds = {};
  }

  log(message) {
    console.log(`[Pool][${moment().format('H:mm:ss')}] ${message}`);
  }

  /**
   * Добавить агента
   * @param {string} id Индентификатор агента
   * @param {string} host Хост агента
   */
  add(id, host) {
    this.pool.enqueue({ id, host });
    this.log(`Add agent #${id} in pool`);
  }

  /**
   * Проверить связь с агентом
   * @param {string} host Хост агента
   */
  async ping(host) {
    return axios.get(`${host}/ping`)
      .then(({ data }) => data);
  }

  /**
   * Ожидаем появление свободных агентов
   */
  async await() {
    const AWAIT_TIMEOUT = 8000;

    if (this.pool.size) {
      const agent = this.pool.front();

      try {
        return await this.ping(agent.host);
      } catch (error) {
        this.pool.dequeue();
        return this.await();
      }
    }
    return new Promise((resolve) => {
      this.log('Waiting available agent in pool...');
      setTimeout(() => {
        resolve(this.await());
      }, AWAIT_TIMEOUT);
    });
  }

  /**
   * Назначить свободному агенту задачу
   * @param {Object} build Параметры сборки
   * @param {Object} config Конфигурация
   */
  async assing(build, config = {}) {
    if (!this.pool.size) {
      throw new Error('Pool of agents is empty');
    }
    const agent = this.pool.dequeue();
    const { repoName, buildCommand, mainBranch } = config;
    const { id: buildId, commitHash, branchName = mainBranch } = build;
    const task = {
      buildId, repoName, branchName, commitHash, buildCommand,
    };

    this.builds[buildId] = { agent, task };

    return axios.post(`${agent.host}/build`, task)
      .then(({ data }) => {
        this.log(`Build ${buildId} was assinges to agent #${agent.id}`);
        return data;
      });
  }

  /**
   * Ни один из агентов не занят указанной сборкой
   * @param {string} buildId Индентификатор сборки
   */
  async isNotInProgress(buildId) {
    if (!this.builds[buildId]) {
      return true;
    }
    const { agent } = this.builds[buildId];

    try {
      const { task } = await this.ping(agent.host);
      const isInProgress = task && (task.buildId === buildId);

      if (!isInProgress) {
        this.builds[buildId] = undefined;
      }
      return !isInProgress;
    } catch (error) {
      return true;
    }
  }
}

module.exports = Pool;
