const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const conf = require('./agent-conf.json');

const app = express();
const router = express.Router();

app.use(bodyParser.json());

router.post('/build', asyncHandler(async (req, res) => {
  res.status(200).json({ data: '/build' });
}));

app.use(router);

app.listen(conf.port, conf.hostname, () => {
  console.log(`Agent was successfully started at ${conf.hostname}:${conf.port}`);
});
