FROM node:20-alpine AS node-runtime
RUN npm install --global npm@11.19.0

FROM node-runtime AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node-runtime AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node-runtime AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_USE_HEADER_AUTH
ARG VITE_USER_ID
ARG VITE_PUBLIC_ORIGIN
ARG VITE_PUBLIC_HOST_ALLOWLIST
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_USE_HEADER_AUTH=$VITE_USE_HEADER_AUTH
ENV VITE_USER_ID=$VITE_USER_ID
ENV VITE_PUBLIC_ORIGIN=$VITE_PUBLIC_ORIGIN
ENV VITE_PUBLIC_HOST_ALLOWLIST=$VITE_PUBLIC_HOST_ALLOWLIST
RUN npm run build

FROM node-runtime
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["npm", "run", "start"]
