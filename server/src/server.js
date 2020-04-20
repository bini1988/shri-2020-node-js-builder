/* eslint-disable no-param-reassign */
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
    this.waitingQueue = new Queue();
    this.inProgressQueue = new Queue();
  }

  run() {
    this.app.listen(this.port, this.hostname, async () => {
      this.log(`Server was started at ${this.host}`);
      this.enqueueBuilds();
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

  async enqueueBuilds() {
    const ENQUEUE_TIMEOUT = 10000;

    this.log('Fetching waiting builds list...');

    return Promise.all([
      this.fetchConfiguration(),
      this.fetchBuilds(),
    ]).then(([config = {}, buildsByStatus]) => {
      const { Waiting = [], InProgress = [] } = buildsByStatus;

      if (config.id) {
        this.configs.set(config.id, config);
      }
      if (Waiting.length > 0) {
        this.waitingQueue.enqueue(Waiting.reverse());
        this.log(`Enqueued ${Waiting.length} waiting builds`);
      }
      if (InProgress.length > 0) {
        this.inProgressQueue.enqueue(InProgress.reverse());
        this.log(`Enqueued ${InProgress.length} in progress builds`);
      }
    }).catch((error) => {
      this.log('Can not fetch builds list ', error.message);
    }).finally(() => {
      if (this.waitingQueue.size) {
        setImmediate(() => this.processWaitingQueue());
      }
      if (this.inProgressQueue.size) {
        setImmediate(() => this.processInProgressQueue());
      }
      if (!this.waitingQueue.size && !this.inProgressQueue.size) {
        this.log(`Retry fetch builds list after ${ENQUEUE_TIMEOUT} ms...`);
        setTimeout(() => this.enqueueBuilds(), ENQUEUE_TIMEOUT);
      }
    });
  }

  async processWaitingQueue() {
    const build = this.waitingQueue.front();
    const queueSize = this.waitingQueue.size;
    const { id: buildId, configurationId } = build;

    this.log(`Processing build ${buildId} (${queueSize - 1} more in queue)`);

    if (!this.configs.has(configurationId)) {
      this.log(`No config for build ${buildId}, removed from queue`);
      this.waitingQueue.dequeue();
    }
    await this.agents.waitAvailables();

    try {
      const config = this.configs.get(configurationId);
      const agent = await this.agents.assing(build, config);
      const { id: agentId, task: { startTime } = {} } = agent;

      if (build.status === 'Waiting') {
        await this.startBuild(buildId, startTime);
      }
      this.log(`Build ${buildId} is progressed by agent ${agentId}`);
      this.waitingQueue.dequeue();
    } catch (error) {
      this.log(`Cannot assing build ${buildId} to agent ${error.message}`);
    }

    if (this.waitingQueue.size) {
      setImmediate(() => this.processWaitingQueue());
    } else if (this.inProgressQueue.size) {
      setImmediate(() => this.processInProgressQueue());
    } else {
      setImmediate(() => this.enqueueBuilds());
    }
  }

  async processInProgressQueue() {
    const ENQUEUE_TIMEOUT = 20000;
    const build = this.inProgressQueue.dequeue();
    const { id: buildId } = build;

    try {
      const isInProgress = await this.agents.isInProgress(buildId);
      if (!isInProgress) {
        this.waitingQueue.enqueue(build);
      } else {
        this.log(`Build ${buildId} is in progress`);
      }
    } catch (error) {
      this.log(`Failed in progress build ${buildId} check`);
    }

    if (this.inProgressQueue.size) {
      setImmediate(() => this.processInProgressQueue());
    } else if (this.waitingQueue.size) {
      setImmediate(() => this.processWaitingQueue());
    } else {
      setTimeout(() => this.enqueueBuilds(), ENQUEUE_TIMEOUT);
    }
  }

  fetchConfiguration() {
    return this.api.get('/conf').then((res) => {
      const { data = null } = res.data;
      return data;
    });
  }

  fetchBuilds() {
    return this.api.get('/build/list').then((res) => {
      const { data = [] } = res.data;
      return data.reduce((out, it) => {
        if (out[it.status]) {
          out[it.status].push(it);
        }
        return out;
      }, {
        Waiting: [], InProgress: [],
      });
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
