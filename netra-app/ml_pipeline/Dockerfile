FROM python:3.10-slim

WORKDIR /app

# System dependencies removed, using opencv-python-headless

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Add production server and CORS
RUN pip install --no-cache-dir gunicorn flask-cors

# Copy code
COPY . .

# Flask typically runs on 5000
EXPOSE 5000

# Start with Gunicorn (1 worker, 4 threads due to memory limits)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "120", "inference_service:app"]
