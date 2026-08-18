import http.server
import logging
import os
import random
import socket
import socketserver
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

LOSS_PROBABILITY = float(os.environ.get("LOSS_PROBABILITY", "0.9"))
LATENCY_MIN_MS = int(os.environ.get("LATENCY_MIN_MS", "300"))
LATENCY_MAX_MS = int(os.environ.get("LATENCY_MAX_MS", "2000"))
TARGET_URL = os.environ.get("TARGET_URL", "http://127.0.0.1:8000").rstrip("/")
PROXY_PORT = int(os.environ.get("PROXY_PORT", "8001"))


class LossSimulatingProxy(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _forward(self) -> None:
        if random.random() < LOSS_PROBABILITY:
            delay = random.uniform(0, LATENCY_MAX_MS / 1000)
            logger.info("dropping %s %s after %.2fs (simulated loss)", self.command, self.path, delay)
            time.sleep(delay)
            self.close_connection = True
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            return

        latency = random.uniform(LATENCY_MIN_MS / 1000, LATENCY_MAX_MS / 1000)
        time.sleep(latency)

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else None

        target = f"{TARGET_URL}{self.path}"
        req = urllib.request.Request(target, data=body, method=self.command)
        for key, value in self.headers.items():
            if key.lower() in ("host", "content-length", "connection"):
                continue
            req.add_header(key, value)

        try:
            with urllib.request.urlopen(req, timeout=30) as upstream:
                response_body = upstream.read()
                self.send_response(upstream.status)
                for key, value in upstream.headers.items():
                    if key.lower() in ("connection", "transfer-encoding", "content-length"):
                        continue
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
        except urllib.error.HTTPError as exc:
            # Forward the upstream headers here too. Dropping them loses CORS on error
            # responses, which makes a browser report a readable 4xx/5xx as an opaque
            # network failure — the client would then retry something deterministic.
            response_body = exc.read()
            self.send_response(exc.code)
            for key, value in exc.headers.items():
                if key.lower() in ("connection", "transfer-encoding", "content-length"):
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            logger.exception("upstream request failed")
            self.send_error(502, "upstream request failed")

    def do_GET(self) -> None:
        self._forward()

    def do_POST(self) -> None:
        self._forward()

    def do_OPTIONS(self) -> None:
        # CORS preflight is answered here, never dropped: a lost preflight fails the
        # request in a way no real SMS/2G channel would, and it isn't what we simulate.
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format: str, *args) -> None:
        logger.info(format, *args)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    with socketserver.ThreadingTCPServer(("127.0.0.1", PROXY_PORT), LossSimulatingProxy) as httpd:
        logger.info(
            "simulate_loss proxy listening on 127.0.0.1:%s -> %s (loss=%.0f%%, latency=%d-%dms)",
            PROXY_PORT,
            TARGET_URL,
            LOSS_PROBABILITY * 100,
            LATENCY_MIN_MS,
            LATENCY_MAX_MS,
        )
        httpd.serve_forever()


if __name__ == "__main__":
    main()
