FROM node:24-bookworm AS node-toolchain

FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    fakeroot \
    git \
    libsecret-1-dev \
    pkg-config \
    python3 \
    rpm \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

COPY --from=node-toolchain /usr/local /usr/local

RUN corepack enable \
  && corepack prepare pnpm@10.24.0 --activate

WORKDIR /workspace

COPY config/docker/kernel-runtime/build-linux-artifact.sh /usr/local/bin/build-linux-artifact
RUN chmod 755 /usr/local/bin/build-linux-artifact

ENTRYPOINT ["/usr/local/bin/build-linux-artifact"]
