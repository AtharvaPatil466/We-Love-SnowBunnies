# FraudSense

FraudSense is a hackathon-ready starter for graph-based UPI and card fraud detection. It combines a FastAPI backend, a PyTorch/PyG-oriented ML pipeline, a React dashboard for fraud-ring visualization, and an Expo mobile app for real-time alerts.

## Architecture

- `backend/`: FastAPI service exposing `/predict`, `/graph/{user_id}`, `/rings/{user_id}`, `/analytics/{user_id}`, `/alert`, Expo device registration, and bearer-token auth
- `ml/`: data preparation, graph construction, model definitions, training, and inference helpers
- `web/`: React + Vite dashboard with D3 graph visualization and analytics cards
- `mobile/`: Expo starter app for customer-side fraud alerts, inbox view, and live risk scores

## Project Flow

1. Load the IEEE-CIS transaction CSV in `ml/src/data_pipeline.py`
2. Engineer transaction and account features
3. Build a graph in `ml/src/graph_builder.py`
4. Train a GNN in `ml/src/train.py`
5. Export a checkpoint for backend inference
6. Serve predictions and graph slices with FastAPI
7. Visualize rings in the dashboard and send alerts to mobile clients

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# optional for checkpoint-backed inference on Python 3.11:
# pip install -r requirements-ml.txt
# optional: cp .env.example .env
uvicorn app.main:app --reload
```

Seeded local accounts after first backend start:

- analyst: `asha / asha@1234`
- analyst: `rahul / rahul@1234`
- customer: `ria / ria@1234`

### ML Pipeline

```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.train --csv /path/to/train_transaction.csv
```

This training flow now exports a runtime scorer inside the checkpoint, so the backend can use a trained artifact directly for live predictions.
It also writes evaluation metrics to `ml/checkpoints/fraudsense_metrics.json`.

### Web Dashboard

```bash
cd web
npm install
# optional: cp .env.example .env
npm run dev
```

### Mobile App

```bash
cd mobile
npm install
# optional: cp .env.example .env
npm run start
```

### Full Local Stack

```bash
make stack
```

This starts `neo4j`, `backend`, and `web` together for the demo stack.

or run pieces individually:

```bash
make backend
make web
make mobile
make smoke-test
make backend-test
```

## Demo Notes

- The backend already includes a heuristic fallback scorer so the product can be demoed before a trained model checkpoint exists.
- If `backend/.env` points to a trained checkpoint, the API will acknowledge that checkpoint in health output and prediction explanations.
- The graph endpoint returns an in-memory subgraph, which is enough for a live D3 demo and can later be swapped for Neo4j.
- The ML code is structured for PyTorch Geometric, but it stays lightweight enough for a hackathon repo.
- Medium and high-risk predictions automatically create mobile-visible alerts for the sender account.
- If an Expo push token is registered for a user, alerts can also be delivered through Expo push. By default the backend runs in Expo dry-run mode for safe local demos.
- If Neo4j credentials are configured, transactions are mirrored into Neo4j and graph reads prefer the persisted store.

## API Surface

- `GET /health`: health status plus model source
- `POST /auth/login`: exchange username/password for a bearer token
- `POST /auth/register`: create a customer account and receive a bearer token
- `GET /auth/me`: resolve the current bearer token
- `GET /auth/users`: analyst-only user listing
- `POST /predict`: score a transaction and attach any linked ring IDs
- `GET /graph/{user_id}`: fetch a graph neighborhood with rings included
- `GET /rings/{user_id}`: fetch only fraud-ring summaries
- `GET /analytics/{user_id}`: fetch dashboard metrics derived from the graph
- `POST /devices/register`: register an Expo push token for a mobile user
- `POST /alert`: demo push-alert trigger
- `GET /alerts/{user_id}`: fetch the stored alert inbox for a mobile user

## Verification

For a quick end-to-end backend check after dependencies are installed:

```bash
make smoke-test
```

For backend tests on a supported Python version:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

For dashboard tests:

```bash
cd web
npm test
```

For mobile tests:

```bash
cd mobile
npm test -- --runInBand
```

For a clean local runtime check, this repo has been verified with:

- backend health on `http://127.0.0.1:8001/health`
- web dev server on `http://127.0.0.1:5173`
- Expo Metro on `exp://127.0.0.1:8082`

For real model validation, place the IEEE-CIS `train_transaction.csv` somewhere local and run:

```bash
make ml-train CSV=/absolute/path/to/train_transaction.csv
```

That produces:

- `ml/checkpoints/fraudsense_gat.pt`
- `ml/checkpoints/fraudsense_metrics.json`

## CI

GitHub Actions workflows are included for backend, web, and mobile:

- [.github/workflows/backend-ci.yml](/Users/atharva/Documents/New%20project/.github/workflows/backend-ci.yml) runs backend tests on Python `3.11`
- [.github/workflows/web-ci.yml](/Users/atharva/Documents/New%20project/.github/workflows/web-ci.yml) runs dashboard tests on Node `20`
- [.github/workflows/mobile-ci.yml](/Users/atharva/Documents/New%20project/.github/workflows/mobile-ci.yml) runs mobile tests on Node `20`

## Environment

Copy [backend/.env.example](/Users/atharva/Documents/New%20project/backend/.env.example) to `backend/.env` if you want to configure:

- `MODEL_CHECKPOINT_PATH`
- `AUTH_SECRET_KEY`
- `AUTH_TOKEN_TTL_MINUTES`
- `AUTH_USERS_PATH`
- `GRAPH_FOCUS_USER_ID`
- `HIGH_RISK_THRESHOLD`
- `MEDIUM_RISK_THRESHOLD`
- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `LOG_LEVEL`
- `EXPO_PUSH_URL`
- `EXPO_PUSH_ACCESS_TOKEN`
- `EXPO_PUSH_DRY_RUN`

Frontend env files:

- [web/.env.example](/Users/atharva/Documents/New%20project/web/.env.example) for `VITE_API_BASE_URL`
- [mobile/.env.example](/Users/atharva/Documents/New%20project/mobile/.env.example) for `EXPO_PUBLIC_API_BASE_URL`

## Python Notes

- The intended stack is Python `3.11`.
- Core API smoke testing can run with `backend/requirements.txt`.
- Checkpoint-backed model serving additionally needs `backend/requirements-ml.txt`.

## Deployment

Backend deployment helpers:

- [backend/Procfile](/Users/atharva/Documents/New%20project/backend/Procfile) for Railway-style startup
- [backend/start.sh](/Users/atharva/Documents/New%20project/backend/start.sh) for Docker/container startup
- [render.yaml](/Users/atharva/Documents/New%20project/render.yaml) for a Render-ready backend + static web setup

Typical hosted flow:

1. Deploy the backend from `backend/`
2. Set backend env vars like `AUTH_SECRET_KEY`, `GRAPH_FOCUS_USER_ID`, and any optional Neo4j/checkpoint values
3. Deploy the web app from `web/` with `VITE_API_BASE_URL` pointed at the hosted backend
4. Set `EXPO_PUBLIC_API_BASE_URL` for the mobile app before running Expo or building a client

## Suggested Team Split

- ML: `ml/src/data_pipeline.py`, `ml/src/graph_builder.py`, `ml/src/train.py`
- Backend: `backend/app/main.py`, `backend/app/services/*`
- Web: `web/src/*`
- Mobile + presentation: `mobile/*`, `README.md`, pitch assets
