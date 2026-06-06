import os

# Bind to the port Render provides via the PORT environment variable.
PORT = os.environ.get("PORT", "10000")
bind = f"0.0.0.0:{PORT}"

# Worker count can be tuned via WEB_CONCURRENCY env var if desired.
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
timeout = 120
keepalive = 5
errorlog = '-'
loglevel = 'info'
accesslog = '-'