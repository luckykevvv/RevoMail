cd backend
cp .env.example .env

Then Fill in SECRET_KEY (generate one with: python -c "import secrets; print(secrets.token_hex(32))")

pip install -r requirements.txt
uvicorn app.main:app --reload