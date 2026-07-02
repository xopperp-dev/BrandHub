# BrandHub

## Structure
```
BrandHub/
├── brandhub_backend/   ← Django backend
└── frontend/           ← React + Vite frontend
```

## Run Backend
```bash
cd brandhub_backend
pip install django djangorestframework djangorestframework-simplejwt django-cors-headers cryptography requests
python manage.py migrate
python manage.py createsuperuser   # or register via the app's Register page
python manage.py runserver
```

## Run Frontend
```bash
cd frontend
cp .env.example .env.local   # VITE_API_BASE=http://localhost:8000
npm install
npm run dev
```
