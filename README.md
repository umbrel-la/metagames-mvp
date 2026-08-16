# MetaGames MVP

Next.js-сервис, который ежечасно получает реальные игры с Metacritic, сохраняет
их в Turso, делает отдельные OpenAI-summary отзывов критиков и пользователей и
показывает каталог с поиском, фильтром и рекомендациями.

## Локальный запуск

Требуется Node.js 20+.

```bash
git clone <repository-url>
cd <repository-directory>
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Приложение откроется на `http://localhost:3000`.

## Turso

1. Установите Turso CLI и выполните `turso auth login`.
2. Создайте базу: `turso db create metagames`.
3. Получите URL: `turso db show metagames --url`.
4. Создайте token: `turso db tokens create metagames`.
5. Запишите значения в `.env.local`:

```env
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

Примените хранящуюся в репозитории схему:

```bash
npm run db:migrate
```

## OpenAI

Добавьте API key в `.env.local`:

```env
OPENAI_API_KEY=sk-...
```

При наличии минимум трех отзывов сервис отправляет только их тексты в OpenAI и
ожидает короткий JSON с положительными и отрицательными тезисами. Без ключа
игры сохраняются, но summaries остаются пустыми.

## Запуск scraper вручную

Задайте длинный случайный `CRON_SECRET` в `.env.local`, запустите `npm run dev`,
затем в другом терминале:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/scrape
```

Первый успешный запуск календарного дня (UTC) обрабатывает 20 карточек из
`New Releases`. Каждый следующий запуск берет очередную страницу `Browse New`.
На новый UTC-день цикл начинается заново. Ошибка отдельной игры записывается в
результат запуска и не останавливает остальные игры.

Scraper использует обычный server-side `fetch + cheerio`. Реальные
`data-testid` и Nuxt payload Metacritic были проверены перед реализацией;
Playwright не нужен и не установлен.

## Vercel

1. Отправьте репозиторий в GitHub.
2. В Vercel выберите **Add New → Project** и импортируйте репозиторий.
3. Добавьте `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`,
   `SUPADATA_API_KEY` и `CRON_SECRET` для Production.
4. Выполните deploy.

Для Vercel Hobby встроенное cron-расписание не настроено. Вызывайте
`/api/cron/scrape` раз в час из внешнего cron-сервиса, передавая
`Authorization: Bearer <CRON_SECRET>`. Scraper routes рассчитаны на
serverless-функции длительностью до 300 секунд.

## Проверки

```bash
npm run lint
npm run typecheck
npm run build
```

Схема находится в `db/migrations`. Секреты игнорируются Git; коммитится только
`.env.example`.
