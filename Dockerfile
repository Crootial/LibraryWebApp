# Built in stages, and Jenkins picks the ones it needs with --target:
#   deps     the production dependencies, shared by the other two
#   test     the app plus its tests; running it executes the test suite
#   runtime  the app as it is deployed
# Build one with: docker build --target test -t librarywebapp-test .

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM deps AS test
COPY . .
RUN mkdir -p test-results
CMD ["npm", "run", "test:ci"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV DATA_DIR=/data PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js auth.js db.js friends.js profile.js ./
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
