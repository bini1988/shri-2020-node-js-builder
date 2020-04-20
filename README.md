# shri-2020-node-js-builder

Домашнее задание к лекции Инфраструктура

## Описание

### Работа сервера

1. Сервер опрашивает `https://hw.shri.yandex/api/` (`server-conf.json`), получает актуальную конфигурацию и список сборок
2. Если список сборок содержит элементы, ставит их в очередь и начинает её обрабатывать
2.1 Берется сборка из очереди, проверяется наличие конфигурации для неё
2.1.1 Если конфигурации для сборки нет, сборка удаляется из очереди
2.2 Ожидаем совободного агента для обработки сборки
2.3 Назначаем сборку свободному агенту, меняем статус сборки на InProgress
2.4 Удаляем сборку из очереди
2.5 Проверяем очередь сборок если пуста перейти к п. 1, если нет к п. 2.1

### Работа агента

1. Регистрируется по адресу `serverHost:serverPort` (`agent-conf.json`)
2. Получает параметры сборки на `/build`
3. Выполняет сборку, оправляет уведомление серверу

## Запуск

1. Добавить в файл `./server/server-conf.json` параметр `apiToken` - хэш ключа авторизации к серверному API
2. Запустить сервер `cd ./server && npm i && npm run start`, cервер доступен по адресу по адресу `http://127.0.0.1:3131/`
3. Запустить агента `cd ./agent && npm i && npm run start`
4. Создать конфиругацию, отправив запрос на `https://hw.shri.yandex/api/conf`, например, коммандой (необходимо задать `API_TOKEN`):

  ```bash
    curl -X POST "https://hw.shri.yandex/api/conf" -H  "accept: */*" -H  "Authorization: Bearer API_TOKEN" -H  "Content-Type: application/json" -d "{\"repoName\":\"bini1988/shri-2020-node-js-homework\",\"buildCommand\":\"npm run build:client\",\"mainBranch\":\"master\",\"period\":0}"
  ```

  где:
  - `repoName` путь к публичному репозиторию на `https://github.com`,
  - `buildCommand` выполняемая комманда (`npm i` выполнится автоматически)
  - `mainBranch` ветка из которой берутся коммиты

5. Создать сборку, отправив запрос на `https://hw.shri.yandex/api/build/request`, например, коммандой (необходимо задать `API_TOKEN`):

  ```bash
  curl -X POST "https://hw.shri.yandex/api/build/request" -H  "accept: text/plain" -H  "Authorization: Bearer API_TOKEN" -H  "Content-Type: application/json" -d "{\"commitMessage\":\"New build #1\",\"commitHash\":\"76fe7c1\",\"branchName\":\"master\",\"authorName\":\"Morgan Freeman\"}"
  ```

  где:
  - `commitMessage` сообщение коммита на котором происходит сборка
  - `commitHash` хэш коммита на котором происходит сборка
  - `branchName` ветка из которой берется коммит
  - `authorName` автор коммита

  Полученный в ответе id сборки, модно использовать для получения статуса сборки (необходимо задать `API_TOKEN`):

  ```bash
  curl -X GET "https://hw.shri.yandex/api/build/details?buildId=d57660e6-2c15-4cd8-bdb1-ec0cd132158e" -H  "accept: text/plain" -H  "Authorization: Bearer API_TOKEN"
  ```

  и лога сборки (необходимо задать `API_TOKEN`):

  ```bash
  curl -X GET "https://hw.shri.yandex/api/build/log?buildId=d57660e6-2c15-4cd8-bdb1-ec0cd132158e" -H  "accept: */*" -H  "Authorization: Bearer API_TOKEN"
  ```

6. Сервер должен автоматически получить созданный объект сборки и передать его агенту на выполненние, по заврешению сохранется лог сборки и обновляется её статус.
