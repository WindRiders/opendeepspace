#!/bin/bash
# DeepSpace Engine — dual-process entrypoint (FastAPI + gRPC)
set -e

cleanup() {
    echo "Shutting down..."
    kill $FASTAPI_PID $GRPC_PID 2>/dev/null
    wait $FASTAPI_PID $GRPC_PID 2>/dev/null
    exit 0
}

trap cleanup SIGTERM SIGINT

echo "Starting FastAPI on :8645..."
python -m uvicorn api.server:app --host 0.0.0.0 --port 8645 &
FASTAPI_PID=$!

echo "Starting gRPC on :50051..."
python -m api.grpc_server &
GRPC_PID=$!

wait -n
cleanup