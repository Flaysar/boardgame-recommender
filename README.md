**BoardGame Recommender** — интеллектуальный веб-сервис для подбора настольных игр на основе семантического анализа.
Описывайте желаемую игру своими словами, используйте фильтры и референс-игры для получения персонализированных рекомендаций.

![Главная страница](frontend/public/screenshot.png)

## Возможности
- Семантический поиск игр по текстовому описанию (векторные эмбеддинги)
- Подбор игр по референсу (смешивание эмбеддингов текста и игры-образца)
- Гибкие фильтры: количество игроков, время партии, сложность, механики, категории
- Двухэтапный ранжирование: векторный поиск + cross-encoder reranking
- Перевод русскоязычных запросов на английский (Yandex Translate API)
- Поиск игр по названию для выбора референса

## Инструкция по запуску

### Бэкенд (Python API)

0. Склонируйте репозиторий
```bash
git clone https://github.com/Flaysar/boardgame-recommender.git
cd boardgame-recommender/backend
```

1. Создайте виртуальное окружение и активируйте его
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate
```

2. Установите зависимости
```bash
pip install -r requirements.txt
```

3. Настройте переменные окружения (создайте `.env` файл)
```env
DATABASE_URL=postgresql://user:password@host:port/dbname
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=boardgame
TRANSLATOR_API_KEY=ваш_ключ
YANDEX_CATALOG_ID=ваш_catalog_id
PYTHON_API_URL=http://localhost:10000
```

4. Запустите API-сервер
```bash
uvicorn api_server:app --host 0.0.0.0 --port 10000
```

### Фронтенд (Next.js)

1. Перейдите в папку frontend
```bash
cd ../frontend
```

2. Установите зависимости
```bash
npm install
```

3. Настройте переменные окружения (создайте `.env.local`)
```env
PYTHON_API_URL=http://localhost:10000
PYTHON_API_RECOMMEND_PATH=/recommend
PYTHON_API_META_PATH=/meta
PYTHON_API_GAMES_SEARCH_PATH=/games/search
```

4. Запустите приложение
```bash
npm run dev
```

5. Откройте в браузере
```
http://localhost:3000
```

## Архитектура

### Бэкенд
- **FastAPI** — REST API сервер
- **PostgreSQL + pgvector** — хранение игр и векторный поиск
- **Sentence Transformers** (all-MiniLM-L6-v2) — текстовые эмбеддинги
- **Cross Encoder** (ms-marco-MiniLM-L-6-v2) — переранжирование результатов
- **Yandex Translate API** — перевод запросов с русского на английский

### Фронтенд
- **Next.js 15** — React-фреймворк
- **TypeScript** — типизация
- **Tailwind CSS** — стилизация компонентов

## Как это работает

1. Пользователь вводит описание желаемой игры (например: *"кооператив на одного против игры с картами событий"*)
2. Запрос переводится на английский (если содержит кириллицу)
3. Генерируется векторный эмбеддинг запроса
4. В БД находится топ-N игр по косинусному расстоянию между эмбеддингами
5. Результаты переранжируются cross-encoder'ом для учёта контекста
6. Пользователю показываются карточки рекомендованных игр

## Docker (опционально)

Сборка и запуск бэкенда в Docker:
```bash
cd backend
docker build -t boardgame-api .
docker run -p 10000:10000 --env-file .env boardgame-api
```
