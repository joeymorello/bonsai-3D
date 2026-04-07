.PHONY: install dev test lint

install:
	pip install -r requirements.txt

dev:
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v

lint:
	ruff check src/
