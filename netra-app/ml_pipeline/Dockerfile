FROM python:3.10

WORKDIR /app

# Install system graphics library for OpenCV
RUN apt-get update && apt-get install -y libgl1 && rm -rf /var/lib/apt/lists/*

# System dependencies removed, using opencv-python-headless

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Force remove the GUI version of OpenCV that ultralytics sneakily installs
RUN pip uninstall -y opencv-python || true
RUN pip install --no-cache-dir --force-reinstall opencv-python-headless

# Add production server and CORS
RUN pip install --no-cache-dir gunicorn flask-cors

# Copy code into a directory named ml_pipeline to preserve absolute imports
COPY . /app/ml_pipeline

# Flask typically runs on 5000
EXPOSE 5000

# Start with Gunicorn (point to ml_pipeline.inference_service)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "120", "ml_pipeline.inference_service:app"]
