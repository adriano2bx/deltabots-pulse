# Gates automatizáveis

1. `python quality/check_specs.py` valida os requisitos F001–F390, JSON, OpenAPI e migração SQL.
2. Use ferramentas OpenAPI de lint (Spectral/Redocly) e `openapi-typescript` para gerar SDK/contratos na implementação.
3. Os Gherkin em `scenarios.feature` são oráculos de teste. Converter em testes Android/Workers/Playwright de verdade antes do release.
4. Testes de hardware HW01–HW15 exigem device físico — simulação jamais conta como PASS de HW.
5. Testes de segurança red-team e monitoramento de dispositivos safety-critical são gates obrigatórios.

Em v1.1 a validação inclui os schemas de temas, exemplo de manifesto, 76 rotas Android, D1 migration 0002 e ao menos 90 operações OpenAPI. `jsonschema` e `PyYAML` são dependências de validação.
