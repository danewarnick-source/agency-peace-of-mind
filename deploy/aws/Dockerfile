# Runs the already-built nitro "node-server" output (dist-aws/server) on
# AWS App Runner. Build context must be the repo root (not this directory)
# so COPY below can reach dist-aws/server — see .github/workflows/deploy-aws.yml,
# which runs `npm run build:aws` before building this image.
#
# dist-aws/server is already self-contained (nitro traces and bundles its
# own runtime deps into server/node_modules — see server/package.json,
# "traced-node-modules") — no `npm install` needed in the image at all.
FROM node:20-slim

WORKDIR /app
COPY dist-aws/server/ ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# No shell needed — plain array form execs node directly as PID 1.
CMD ["node", "index.mjs"]
