# HyperIdle Development Environment
# Full dev stack: Node.js, Claude Code, Playwright, git, gh
FROM node:26-bookworm

# System deps: build tools for native addons, git, utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
    git git-lfs \
    curl unzip jq sudo \
    # Playwright system deps (Chromium)
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# tsx for TypeScript execution
RUN npm install -g tsx

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Playwright browsers (Chromium only)
RUN npx playwright install chromium

# Create non-root user (claude can't run --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash dev \
    && echo "dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

ENV HYPERIDLE_DOCKER=1
EXPOSE 3001 5173
WORKDIR /workspace

USER dev
CMD ["bash"]
