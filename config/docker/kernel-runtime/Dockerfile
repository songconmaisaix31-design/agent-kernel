FROM node:24-bookworm@sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0 AS node-toolchain

FROM node-toolchain

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

RUN corepack enable pnpm \
  && corepack prepare pnpm@10.24.0 --activate

WORKDIR /workspace

COPY config/docker/kernel-runtime/build-linux-artifact.sh /usr/local/bin/build-linux-artifact
RUN sed -i 's/\r$//' /usr/local/bin/build-linux-artifact \
  && chmod 755 /usr/local/bin/build-linux-artifact

ENTRYPOINT ["/usr/local/bin/build-linux-artifact"]
