FROM alpine:3.22

# Use Alpine's packaged yt-dlp instead of a Python base image: the NAS can
# build from the lightweight Alpine image already used elsewhere in the stack.
RUN apk add --no-cache ca-certificates ffmpeg python3 yt-dlp

WORKDIR /app
COPY server.py /app/server.py

ENV PYTHONUNBUFFERED=1
EXPOSE 9090

CMD ["python", "/app/server.py"]
