# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Email the maintainers directly. We will respond within 48 hours.

## Security Architecture

### Authentication

- **JWT tokens** via Passport.js (`JwtAuthGuard`) for REST API
- **WebSocket auth** via `WsJwtGuard` — JWT verification on handshake, falls back to anonymous with scoped data access
- Passwords hashed with bcrypt

### API Key Management

- LLM API keys stored in `.env` file (never committed)
- Template: `apps/core-engine/.env.example`
- Keys: `DASHSCOPE_API_KEY`, `OPENAI_API_KEY`

### Sandbox Isolation

- All file operations restricted to `SANDBOX_ROOT` directory
- Default: `~/deepspace-sandbox`
- Path traversal attacks blocked via `path.resolve` normalization

### SSRF Protection

The `http_request` agent tool blocks requests to private/internal networks:
- `localhost`, `127.0.0.1`, `0.0.0.0`
- `192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`
- Non-HTTP protocols (`ftp://`, `file://`, etc.)
- 15-second request timeout

### Database

- SQLite via `better-sqlite3` with WAL mode
- Database files stored locally with file system permissions
- User-scoped data access enforced at service layer (user ID matching)

### Best Practices

1. **Never commit `.env` files** — they are in `.gitignore`
2. **Use HTTPS in production** — required for clipboard API and secure WebSocket
3. **Bind to localhost** — default dev server binds to `localhost:3000`, not exposed to public
4. **Rotate JWT secrets** periodically and use strong secrets in production