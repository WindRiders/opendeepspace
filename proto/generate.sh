#!/bin/bash
# Generate gRPC code for Python and TypeScript
# Prerequisites: pip install grpcio-tools, npm install @grpc/grpc-js @grpc/proto-loader

set -e
PROTO_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$PROTO_DIR")"

echo "=== Generating Python gRPC code ==="
python3 -m grpc_tools.protoc \
  -I"$PROTO_DIR" \
  --python_out="$ROOT_DIR/api" \
  --grpc_python_out="$ROOT_DIR/api" \
  "$PROTO_DIR/agent.proto"

# Fix relative imports in generated grpc file
sed -i '' 's/import agent_pb2/from api import agent_pb2/' "$ROOT_DIR/api/agent_pb2_grpc.py" 2>/dev/null || \
  sed -i 's/import agent_pb2/from api import agent_pb2/' "$ROOT_DIR/api/agent_pb2_grpc.py"

echo "=== Python code generated: api/agent_pb2.py, api/agent_pb2_grpc.py ==="

echo "=== Generating TypeScript proto copy ==="
mkdir -p "$ROOT_DIR/apps/core-engine/src/grpc"
cp "$PROTO_DIR/agent.proto" "$ROOT_DIR/apps/core-engine/src/grpc/agent.proto"

echo "=== Done ==="
echo "Python packages needed: grpcio grpcio-tools"
echo "TypeScript packages needed: @grpc/grpc-js @grpc/proto-loader"