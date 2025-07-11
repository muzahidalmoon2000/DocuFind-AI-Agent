#!/bin/bash

echo "🔧 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "🚀 Starting Gunicorn server..."
exec gunicorn app:app --bind 0.0.0.0:$PORT