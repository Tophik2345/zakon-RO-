Диагностическая сборка холодного запуска

Что исправлено:
- главное окно не показывается серым до ready-to-show;
- startup.log создаётся на рабочем столе и в userData;
- логируются app.whenReady, создание окна, dom-ready, did-finish-load, ready-to-show;
- логируется загрузка koffi/GetAsyncKeyState;
- после загрузки koffi вызывается bindHotkey() повторно;
- AppUserModelId = online.russia.fsb.memo;
- features.css, search-engine.js и changes-ui.js добавлены в build.files.

Как проверить:
1. Возьмите diagnostic/main.js и diagnostic/package.json из ветки.
2. Замените ими файлы в проекте.
3. Соберите: npm.cmd run dist
4. Установите Setup.
5. Полностью закройте приложение.
6. Запустите на холодную и дождитесь окна.
7. На рабочем столе появится startup.log.
8. Пришлите startup.log в чат.
