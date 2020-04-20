/* eslint-disable no-plusplus */
/* eslint-disable class-methods-use-this */
const util = require('util');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const {
  rm, execute, cloneRepo, checkoutRepo,
} = require('./utils');

const exists = util.promisify(fs.exists);
const mkdir = util.promisify(fs.mkdir);

/**
 * Агент
 */
class Agent {
  /**
   * Создать агента
   * @param {Object} params
   * @param {number} params.port Порт агента
   * @param {string} params.hostname Хост агента
   * @param {Object} api Api взаимодействия с сервером
   */
  constructor(params = {}) {
    const { port, hostname, api } = params;

    this.port = port;
    this.hostname = hostname;
    this.app = this.createApp();
    this.api = api;

    this.task = null;
  }

  run() {
    this.identify(this.port);

    this.app.listen(this.port, this.hostname, () => {
      this.log(`Server was started at ${this.host}`);
      this.register();
    }).on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        this.port = error.port + 1;
        this.run();
        return;
      }
      this.log('Some error happened', error);
    });
  }

  identify(port) {
    this.id = port;
    this.port = port;
    this.host = `http://${this.hostname}:${port}`;
    this.cwd = path.join(process.cwd(), `tmp_${port}`);
  }

  log(message, error) {
    const timestamp = moment().format('H:mm:ss');
    console.log(`[Agent Smith #${this.id}][${timestamp}] ${message}`);
    // eslint-disable-next-line no-unused-expressions
    error && console.log(error);
  }

  createApp() {
    const app = express();

    app.use(bodyParser.json());

    const router = express.Router();

    router.post('/build', this.createBuildHandler(this));
    router.get('/ping', this.createPingHandler(this));
    app.use(router);

    return app;
  }

  register() {
    const ATTEMPT_TIMEOUT = 7000; // ms
    const hostname = this.api.defaults.baseURL;
    const { id, host } = this;

    this.log('Trying to register...');

    this.api.post('/notify-agent', { id, host }).then(() => {
      this.attempts = 0;
      this.log(`Registered on server at ${hostname}`);
    }).catch((error) => {
      this.log((error.code === 'ENOTFOUND')
        ? `Can not found server at ${hostname}...`
        : 'Some error happened');
      setTimeout(() => this.register(), ATTEMPT_TIMEOUT);
    });
  }

  parseBuildParams(body) {
    const params = {};
    const errors = [];

    ['buildId', 'repoName', 'buildCommand', 'branchName', 'commitHash']
      .forEach((key) => {
        params[key] = body[key];
        if (!params[key]) {
          errors.push(`None empty param [${key}] is required`);
        }
      });
    return { params, errors };
  }

  assing(task) {
    this.task = task;
    this.task.status = 'InProgress';
    this.task.success = false;
    this.task.startTime = new Date().toISOString();
  }

  async clear() {
    if (await exists(this.cwd)) {
      await rm(this.cwd);
    }
  }

  async build() {
    const {
      buildId, repoName, branchName, commitHash, buildCommand,
    } = this.task;

    this.log(`Execute build for '${buildId}'`);

    try {
      this.log(`Execute '${repoName}' cloning ...`);
      await this.clear();
      await mkdir(this.cwd);
      await cloneRepo(`https://github.com/${repoName}`, this.cwd, branchName);
      await checkoutRepo(this.cwd, commitHash);

      if (await exists(path.join(this.cwd, 'package.json'))) {
        this.log('Install node_modules...');
        await execute('npm i', this.cwd);
      }
      this.log(`Execute '${buildCommand}' command...`);

      this.task.output = await execute(buildCommand, this.cwd);
      this.task.status = 'Success';
      this.task.success = true;
      this.task.duration = moment().diff(this.task.startTime);
      this.log('Build is successful finished');
    } catch (error) {
      this.task.output = error.output;
      this.task.status = 'Fail';
      this.task.success = false;
      this.task.duration = moment().diff(this.task.startTime);
      this.log(`Build is failed ${error.message}`);
    }
    this.log(`Execute build for '${buildId}' is finished`);

    await this.complete();
    await this.clear();
  }

  async complete() {
    const { id, host, task } = this;
    const params = { id, host, task };

    this.log('Notify server...');

    return this.api.post('/notify-build-result', params).then(() => {
      this.log(`Notification for '${task.buildId}' is successful sended`);
    }).catch(() => {
      this.log(`Notification for '${task.buildId}' is failed`);
      this.register();
    }).finally(() => {
      this.task = null;
    });
  }

  /**
   * @param {Agent} agent
   */
  createBuildHandler(agent) {
    return asyncHandler(async (req, res) => {
      const { params, errors } = agent.parseBuildParams(req.body);

      if (errors.length) {
        res.status(400).json({ errors });
      } else if (agent.task) {
        const { id, host, task } = agent;
        res.status(429).json({ id, host, task });
      } else {
        agent.assing(params);
        agent.build();

        const { id, host, task } = agent;
        res.status(200).json({ id, host, task });
      }
    });
  }

  /**
   * @param {Agent} agent
   */
  createPingHandler(agent) {
    return asyncHandler(async (req, res) => {
      const { id, host, task } = agent;
      res.status(200).json({ id, host, task });
    });
  }

  static create(params) {
    return new Agent(params);
  }
}

module.exports = Agent;
