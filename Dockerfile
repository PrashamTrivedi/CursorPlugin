# syntax=docker/dockerfile:1
#
# Prasham Cursor dev harness — base image for Cloud Agent environments.
# Product repos: FROM ghcr.io/<owner>/cursor-dev-setup:<tag>
#
# Pin strategy: digest below tracks ubuntu:24.04 amd64; bump on security updates
# or re-pin via `docker buildx imagetools inspect ubuntu:24.04`.
ARG UBUNTU_DIGEST=sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316
FROM ubuntu:24.04@${UBUNTU_DIGEST}

LABEL org.opencontainers.image.source="https://github.com/PrashamTrivedi/CursorPlugin"
LABEL org.opencontainers.image.title="cursor-dev-setup"
LABEL org.opencontainers.image.description="Universal Cursor agent harness: skills, commands, and hook scripts for Cloud Agent base images."

ARG DEBIAN_FRONTEND=noninteractive
ARG BUN_VERSION=1.2.21

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    rsync \
    unzip \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && corepack prepare pnpm@latest --activate \
  && curl -fsSL "https://bun.sh/install" | bash -s "bun-v${BUN_VERSION}" \
  && install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN getent group ubuntu >/dev/null || groupadd --gid 1000 ubuntu \
  && getent passwd ubuntu >/dev/null || useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash ubuntu

ENV HOME=/home/ubuntu
ENV PATH="/usr/local/bin:${PATH}"

# Canonical harness tree (stable fallback paths)
COPY --chown=root:root skills /opt/prasham-cursor/skills
COPY --chown=root:root commands /opt/prasham-cursor/commands
COPY --chown=root:root hooks /opt/prasham-cursor/hooks
COPY --chown=root:root rules /opt/prasham-cursor/rules
COPY --chown=root:root mcp.json /opt/prasham-cursor/mcp.json
COPY --chown=root:root bin/materialize-cursor-harness.sh /opt/prasham-cursor/bin/materialize-cursor-harness.sh

RUN chmod +x /opt/prasham-cursor/bin/materialize-cursor-harness.sh \
  && find /opt/prasham-cursor/hooks -type f \( -name '*.ts' -o -name '*.sh' \) -exec chmod +x {} +

USER ubuntu
RUN /opt/prasham-cursor/bin/materialize-cursor-harness.sh

USER root
RUN chown -hR ubuntu:ubuntu /home/ubuntu/.cursor 2>/dev/null || true \
  && chown -R ubuntu:ubuntu /home/ubuntu/.cursor

USER ubuntu
CMD ["bash"]
