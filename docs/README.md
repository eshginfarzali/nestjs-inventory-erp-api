# docs

Place for supporting material that does not belong in the main README, for example:

- `swagger.png` – a screenshot of the Swagger UI (`http://localhost:3200/docs` after
  `docker compose up --build`), which can then be embedded in the main README.
- Architecture decision records (ADRs), if the project grows.

The OpenAPI document itself is generated at runtime and served at `/docs/openapi.json`.
