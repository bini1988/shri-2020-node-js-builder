/* eslint-disable no-param-reassign */
/* eslint-disable object-curly-newline */
/* eslint-disable class-methods-use-this */
const express = require('express');
const moment = require('moment');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const Pool = require('./pool');
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
    this.server = this.createServer();
    this.api = api;
    this.pool = new Pool();
    this.configs = new Map();
    this.queue = new Queue();
    this.ENQUEUE_TIMEOUT = 20000;
  }

  run() {
    this.server.listen(this.port, this.hostname, async () => {
      this.log(`Server was started at ${this.host}`);
      this.enqueueBuilds();
    }).on('error', (error) => {
      this.log('Some error happened', error.message);
    });
  }

  log(message) {
    console.log(`[Server][${moment().format('H:mm:ss')}] ${message}`);
  }

  createServer() {
    const server = express();
    const router = express.Router();

    server.use(bodyParser.json());
    router.post('/notify-agent', this.createNotifyAgentHandler(this));
    router.post('/notify-build-result', this.createNotifyBuildHandler(this));
    server.use(router);

    return server;
  }

  checkQueue() {
    if (this.queue.size) {
      setImmediate(() => this.processQueue());
      return;
    }
    setTimeout(() => this.enqueueBuilds(), this.ENQUEUE_TIMEOUT);
  }

  async enqueueBuilds() {
    this.log('Fetching builds list...');

    return Promise.all([
      this.api.fetchConfiguration(),
      this.api.fetchBuilds(['Waiting', 'InProgress']),
    ]).then(([config, builds]) => {
      if (config && config.id) {
        this.configs.set(config.id, config);
      }
      if (builds && builds.length) {
        this.queue.enqueue(builds);
        this.log(`Enqueued ${builds.length} builds`);
      }
    }).catch((error) => {
      this.log('Can not fetch builds list ', error);
    }).finally(() => {
      this.checkQueue();
    });
  }

  async processQueue() {
    const build = this.queue.front();
    const { id: buildId, configurationId, status } = build;
    const config = this.configs.get(configurationId);

    if (!config) {
      this.log(`No config for build ${buildId}, removed from queue`);
      this.queue.dequeue();
      return;
    }
    if (status === 'Waiting') {
      // Если сборка в ожидании, необходимо передать её агенту для сборки
      this.log(`Processing waiting build ${buildId}`);
      await this.processBuild(build, config);
    } else if (status === 'InProgress') {
      // Если сборка в процессе, проверим активен ли агент выполняющий сборку
      this.log(`Processing in progress build ${buildId}`);

      if (await this.pool.isNotInProgress(buildId)) {
        await this.processBuild(build, config);
      }
    }
    this.queue.dequeue();
    this.checkQueue();
  }

  async processBuild(build, config) {
    await this.pool.await();
    const { task = {} } = await this.pool.assing(build, config);

    if (build.status === 'Waiting') {
      try {
        await this.api.startBuild({
          buildId: build.id, dateTime: task.startTime,
        });
      } catch (error) {
        this.log(`Can not set build ${build.id} in progress status`);
      }
    }
  }

  /**
   * @param {Server} server
   */
  createNotifyAgentHandler(server) {
    return asyncHandler(async (req, res) => {
      const { id, host } = req.body;
      server.pool.add(id, host);
      res.status(200).end();
    });
  }

  /**
   * @param {Server} server
   */
  createNotifyBuildHandler(server) {
    return asyncHandler(async (req, res) => {
      const { id, host, task = {} } = req.body;
      const { buildId, duration, status, success, output: buildLog } = task;

      server.log(`Agent #${id} is finished build ${buildId}`);

      try {
        await server.api.finishBuild({ buildId, duration, success, buildLog });
        server.log(`Change build ${buildId} status to '${status}'`);
      } catch (error) {
        server.log(`Can not change build ${buildId} status`);
      } finally {
        server.pool.add(id, host);
      }
      res.status(200).end();
    });
  }

  static create(params) {
    return new Server(params);
  }
}

module.exports = Server;
