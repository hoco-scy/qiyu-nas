ARG COLLECTOR_BASE=alpine:3.22
FROM ${COLLECTOR_BASE}

ARG EXTRA_CA_CERTIFICATE_B64=

# Use Alpine's packaged yt-dlp instead of a Python base image: the NAS can
# build from the lightweight Alpine image already used elsewhere in the stack.
# Chromium runs short-lived, empty-profile inspection sessions. It never gets
# a browser profile, cookies, or a public host port.
RUN apk add --no-cache ca-certificates chromium ffmpeg nss-tools python3 yt-dlp \
    && if [ -n "$EXTRA_CA_CERTIFICATE_B64" ]; then \
      printf '%s' "$EXTRA_CA_CERTIFICATE_B64" | base64 -d > /usr/local/share/ca-certificates/qiyu-build-extra-root.crt \
      && update-ca-certificates; \
    fi

WORKDIR /app
COPY server.py /app/server.py

ENV PYTHONUNBUFFERED=1
EXPOSE 9090

CMD ["python", "/app/server.py"]
