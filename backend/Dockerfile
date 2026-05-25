# DocFlow API — multi-stage build.
#
# build stage: Go 모듈/소스 → 정적 binary
# runtime stage: alpine + binary 만 복사 (CGO 비활성)

# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS builder
WORKDIR /src

# 모듈 캐시 효율을 위해 go.mod/go.sum 먼저 복사.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO 비활성 + 작은 binary.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY --from=builder /out/api /app/api

EXPOSE 8080
ENV DOCFLOW_ADDR=":8080" \
    DOCFLOW_ENV="prod"

ENTRYPOINT ["/app/api"]
