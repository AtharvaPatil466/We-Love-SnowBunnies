backend:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload

web:
	cd web && npm install && npm run dev

mobile:
	cd mobile && npm install && npm run start

ml-train:
	cd ml && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && python -m src.train --csv $(CSV)

smoke-test:
	cd backend && . .venv/bin/activate && python scripts/smoke_test.py

backend-test:
	cd backend && . .venv/bin/activate && pytest -q

stack:
	docker compose up --build

web-build:
	cd web && npm run build
