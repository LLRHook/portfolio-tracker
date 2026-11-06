FROM rust:1.93.1-bookworm AS csv-builder
WORKDIR /build
COPY rust/fidelity-csv/Cargo.toml rust/fidelity-csv/Cargo.lock ./
COPY rust/fidelity-csv/src ./src
RUN cargo build --release --locked

FROM node:22-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Keep the Linux binary outside /app: Compose bind-mounts the server sources there.
COPY --from=csv-builder /build/target/release/portfolio-fidelity-csv /usr/local/bin/portfolio-fidelity-csv
ENV FIDELITY_CSV_BIN=/usr/local/bin/portfolio-fidelity-csv
RUN mkdir -p /app/data

CMD ["node", "--watch", "server.js"]
