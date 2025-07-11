#!/bin/bash

echo "🔧 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# ✅ Use default port 5000 if $PORT is empty
PORT=${PORT:-5000}

echo "🚀 Starting Gunicorn server on port $PORT..."
exec gunicorn app:app --bind 0.0.0.0:$PORT
