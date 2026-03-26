from __future__ import annotations

import os
from pathlib import Path


os.environ.setdefault("MODEL_CHECKPOINT_PATH", "")
os.environ.setdefault("AUTH_USERS_PATH", str(Path(__file__).resolve().parent / ".test_auth_users.json"))
