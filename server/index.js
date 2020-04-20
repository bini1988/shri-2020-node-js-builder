const conf = require('./server-conf.json');
const Server = require('./src/server');
const api = require('./src/ci-api');

const { port, hostname } = conf;

Server.create({ port, hostname, api }).run();
