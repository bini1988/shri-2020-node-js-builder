/* eslint-disable object-curly-newline */
/* eslint-disable class-methods-use-this */
const express = require('express');
const moment = require('moment');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const Agents = require('./agents');
const Queue = require('./queue');

class Server {
  /**
   * Создать сервер
   * @param {Object} params
   * @param {number} params.port Порт агента
   * @param {string} params.hostname Хост агента
   * @param {Object} params.api Api бэкэнда CI
   */
  constructor(params = {}) {
    const { port, hostname, api } = params;

    this.port = port;
    this.hostname = hostname;
    this.host = `${hostname}:${port}`;
    this.app = this.createApp();
    this.api = api;
    this.configs = new Map();
    this.agents = new Agents();
    this.agentsQueue = new Queue();
    this.buildsQueue = new Queue();
  }

  run() {
    this.app.listen(this.port, this.hostname, async () => {
      this.log(`Server was started at ${this.host}`);
      this.enqueueWaitingBuilds();
    }).on('error', (error) => {
      console.log('[Server] Some error happened', error);
    });
  }

  log(message) {
    const timestamp = moment().format('H:mm:ss');
    console.log(`[Server][${timestamp}] ${message}`);
  }

  createApp() {
    const app = express();

    app.use(bodyParser.json());

    const router = express.Router();

    router.post('/notify-agent', this.createNotifyAgentHandler(this));
    router.post('/notify-build-result', this.createNotifyBuildHandler(this));
    app.use(router);

    return app;
  }

  async enqueueWaitingBuilds() {
    const ENQUEUE_TIMEOUT = 10000;

    this.log('Fetching waiting builds list...');

    return Promise.all([
      this.fetchConfiguration(),
      this.fetchWaitingBuilds(),
    ]).then(([config = {}, builds = []]) => {
      if (config.id) {
        this.configs.set(config.id, config);
      }
      if (builds.length > 0) {
        this.buildsQueue.enqueue(builds.reverse());
      }
      this.log(`Fetched and enqueued ${builds.length} builds`);
    }).catch((error) => {
      this.log('Can not fetch builds list ', error.message);
    }).finally(() => {
      if (this.buildsQueue.size > 0) {
        setImmediate(() => this.processBuildsQueue());
      } else {
        this.log(`Retry fetch builds list after ${ENQUEUE_TIMEOUT} ms...`);
        setTimeout(() => this.enqueueWaitingBuilds(), ENQUEUE_TIMEOUT);
      }
    });
  }

  async processBuildsQueue() {
    const build = this.buildsQueue.front();
    const queueSize = this.buildsQueue.size;
    const { id, configurationId } = build;

    this.log(`Processing build ${id} (${queueSize - 1} more in queue)`);

    if (!this.configs.has(configurationId)) {
      this.log(`Cannot receive config for build ${id}, removed from queue`);
      this.buildsQueue.dequeue();
    }

    await this.agents.waitAvailables();

    try {
      const config = this.configs.get(configurationId);
      const agent = await this.agents.assing(build, config);
      const { id: agentId, task: { buildId, startTime } = {} } = agent;

      await this.startBuild(buildId, startTime);

      this.log(`Build ${buildId} is progressed by agent ${agentId}`);
      this.buildsQueue.dequeue();
    } catch (error) {
      this.log(`Cannot assing build ${id} to agent`);
    }

    if (this.buildsQueue.size) {
      setImmediate(() => this.processBuildsQueue());
    } else {
      setImmediate(() => this.enqueueWaitingBuilds());
    }
  }

  fetchConfiguration() {
    return this.api.get('/conf').then((res) => {
      const { data = null } = res.data;
      return data;
    });
  }

  fetchWaitingBuilds() {
    return this.api.get('/build/list').then((res) => {
      const { data = [] } = res.data;
      return data.filter((it) => it.status === 'Waiting');
    });
  }

  /**
   * Задать сборке статус выполненния
   * @param {string} buildId Индентификатор сборки
   * @param {string} dateTime Время начала сборки
   */
  startBuild(buildId, dateTime) {
    return this.api.post('/build/start', { buildId, dateTime });
  }

  finishBuild(buildId, params) {
    return this.api.post('/build/finish', { ...params, buildId });
  }

  /**
   * @param {Server} server
   */
  createNotifyAgentHandler(server) {
    return asyncHandler(async (req, res) => {
      const { id, host } = req.body;
      server.agents.register(id, host);
      res.status(200).end();
    });
  }

  /**
   * @param {Server} server
   */
  createNotifyBuildHandler(server) {
    return asyncHandler(async (req, res) => {
      const { id, task = {} } = req.body;
      const { buildId, duration, success, output: buildLog } = task;

      server.log(`Agent ${id} has completion notice for build ${buildId}`);
      try {
        await server.finishBuild(buildId, { duration, success, buildLog });
        server.log(`Successfully finishing build ${buildId}`);
      } catch (error) {
        server.log(`Can not finish build ${buildId}`);
      } finally {
        server.agents.free(id);
      }
      res.status(200).end();
    });
  }

  static create(params) {
    return new Server(params);
  }
}

module.exports = Server;
