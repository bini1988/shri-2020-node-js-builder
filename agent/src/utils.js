/* eslint-disable no-param-reassign */
const rimraf = require('rimraf');
const { exec } = require('child_process');

/**
 * Выполнить комманду
 * @param {string} cmd Исполняемая команда
 * @param {string} cwd Рабочая директория
 */
function execute(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) {
        error.output = stdout + stderr;
        reject(error);
      }
      resolve(stdout || stderr);
    });
  });
}

/**
 * Удалить дирректорию и её содержимое
 * @param {string} path Путь к дирректори
 */
function rm(path) {
  return new Promise((resolve, reject) => {
    rimraf(path, (error) => {
      if (error) { reject(error); }
      resolve();
    });
  });
}

/**
 * Клонировать репозиторий в дирректорию
 * @param {string} repoName Путь к репозиторию
 * @param {string} path Путь к дирректории
 * @param {string} branch Переключиться на ветку
 */
async function cloneRepo(repoName, path, branch = 'master') {
  try {
    await execute(`git clone ${repoName} -b ${branch} ${path}`);
  } catch (error) {
    throw new Error(`Can not clone repo ${repoName}`);
  }
}

/**
 * Переключить репозиторий на коммит
 * @param {string} path Путь к репозиторию
 * @param {string} commitHash Хэш коммита
 */
async function checkoutRepo(path, commitHash) {
  try {
    await execute(`git -C ${path} checkout ${commitHash}`);
  } catch (error) {
    throw new Error(`Can not checkout repo on ${commitHash}`);
  }
}

module.exports = {
  execute, rm, cloneRepo, checkoutRepo,
};
