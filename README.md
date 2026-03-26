# FraudSense

FraudSense is a hackathon-ready starter for graph-based UPI and card fraud detection. It combines a FastAPI backend, a PyTorch/PyG-oriented ML pipeline, a React dashboard for fraud-ring visualization, and an Expo mobile app for real-time alerts.

## Architecture

- `backend/`: FastAPI service exposing `/predict`, `/graph/{user_id}`, and `/alert`
- `backend/`: FastAPI service exposing `/predict`, `/graph/{user_id}`, `/rings/{user_id}`, `/analytics/{user_id}`, and `/alert`
- `ml/`: data preparation, graph construction, model definitions, training, and inference helpers
- `web/`: React + Vite dashboard with D3 graph visualization and analytics cards
- `mobile/`: Expo starter app for customer-side fraud alerts and live risk scores

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
# optional: cp .env.example .env
uvicorn app.main:app --reload
```

### ML Pipeline

```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.train --csv /path/to/train_transaction.csv
```

### Web Dashboard

```bash
cd web
npm install
npm run dev
```

### Mobile App

```bash
cd mobile
npm install
npm run start
```

### Full Local Stack

```bash
make stack
```

or run pieces individually:

```bash
make backend
make web
make mobile
```

## Demo Notes

- The backend already includes a heuristic fallback scorer so the product can be demoed before a trained model checkpoint exists.
- If `backend/.env` points to a trained checkpoint, the API will acknowledge that checkpoint in health output and prediction explanations.
- The graph endpoint returns an in-memory subgraph, which is enough for a live D3 demo and can later be swapped for Neo4j.
- The ML code is structured for PyTorch Geometric, but it stays lightweight enough for a hackathon repo.

## API Surface

- `GET /health`: health status plus model source
- `POST /predict`: score a transaction and attach any linked ring IDs
- `GET /graph/{user_id}`: fetch a graph neighborhood with rings included
- `GET /rings/{user_id}`: fetch only fraud-ring summaries
- `GET /analytics/{user_id}`: fetch dashboard metrics derived from the graph
- `POST /alert`: demo push-alert trigger

## Environment

Copy [backend/.env.example](/Users/atharva/Documents/New%20project/backend/.env.example) to `backend/.env` if you want to configure:

- `MODEL_CHECKPOINT_PATH`
- `GRAPH_FOCUS_USER_ID`
- `HIGH_RISK_THRESHOLD`
- `MEDIUM_RISK_THRESHOLD`

## Suggested Team Split

- ML: `ml/src/data_pipeline.py`, `ml/src/graph_builder.py`, `ml/src/train.py`
- Backend: `backend/app/main.py`, `backend/app/services/*`
- Web: `web/src/*`
- Mobile + presentation: `mobile/*`, `README.md`, pitch assets
# We-Love-SnowBunnies
