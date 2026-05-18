# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, please email the maintainers directly. We will respond within 48 hours
and work with you on a fix.

## Security Considerations

DeepSpace connects to LLM APIs (DashScope/OpenAI-compatible) and stores data
locally. Key security practices:

1. **API Keys**: Never commit API keys. Use environment variables or the
   `${VAR_NAME}` syntax in `config/config.yaml`.
2. **Database Credentials**: Default credentials in `docker-compose.yml` are
   for local development only. Change them in production.
3. **Network**: The API server (`deepspace serve`) binds to `127.0.0.1` by
   default. Do not expose it to the public internet without authentication.
4. **Data**: All data is stored locally. DeepSpace does not send your data to
   any external service beyond the configured LLM provider.