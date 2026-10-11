# 35 — DeltaBots Wearable Theme Studio, catálogo e cadeia de publicação

## 1. Objetivo
Permitir criar e distribuir **interfaces visuais suportadas pela Mi Band 3**, instaláveis pelo aplicativo Pulse Android. Não confundir um tema `.res` com uma ROM que permita criar aplicativos novos; mapeamento de slots de recurso depende de firmware e parser validados. Pipeline mantido pela DeltaBots na Cloudflare com R2/D1/Workers e um *build worker* isolado quando ferramentas de compilação exigirem runtime incompatível com Workers. Nenhum arquivo de firmware original protegido por direito autoral pode ser redistribuído sem licença.

## 2. Personas, permissões e responsabilidades
- Usuário: consultar temas publicados compatíveis, visualizar prévias, instalar no dispositivo ligado ao telefone, avaliar e restaurar se viável.
- Designer autorizado: criar projeto, editar sprites/ícones/fontes autorizados, rodar lint visual e testar simulador; **não** publicar no catálogo global.
- Revisor técnico: validar bytes, parser, inventário de slots e provas de hardware; assina laudo técnico.
- Administrador de release: publica após dupla aprovação e valida direitos/licenças; pode revogar pacote.
- Serviço de build: compila deterministamente artefato de recursos para variante exata, nunca faz flash remoto.

## 3. Pipeline de publicação
1. Criar projeto versionado com owner, copyright/license e modelos-alvo em D1.
2. Carregar imagens/frames e templates em R2 por upload assinado; validação MIME real, tamanho, dimensão, conteúdo e segurança.
3. Editor usa canvas pixel-perfect **128×80 monocromático**, sprites com transparência/bitmaps conforme o formato efetivamente suportado, prévia por região de UI e zoom sem interpolação.
4. Mapeamento de recursos por slots homologados por firmware: `clock`, `steps`, `heart`, `menu_icons`, `notifications` quando o mapa de recursos mostrar tais slots. Se não homologado, bloquear edição desse slot.
5. Pré-visualizador grava *goldens* PNG do design e checa overflow, recortes, legibilidade, idioma, espaços, memória do pacote e fonte.
6. Build com parser/compiler versionado, sandbox e limite de recursos; deterministic hash, reproducibility report e *artifact attestation*.
7. `ThemeManifest` completo assinado por serviço/CI de release com chave de produção guardada em gerenciador apropriado. A chave privada **nunca** fica no app, no cliente web ou em código-fonte.
8. Testes automáticos e imagem com simulador → `validated_in_simulator`.
9. Instalação controlada em dispositivo da matriz de hardware com relatório (`model`, `hw_revision`, `fw_version`, `before/after`, `postchecks`, `device behavior`) → `hardware_tested`.
10. Aprovação de revisor + release manager, verificação da licença dos assets e de bundle original, publicação em catálogo do ambiente aprovado.
11. Distribuição via HTTPS/R2; rotação de chaves e revogação com auditoria; canary para modelos/revisões testadas, não para todas as Mi Band 3.

## 4. Manifesto assinado
O conteúdo JSON tipado segue `contracts/theme-manifest.schema.json` e exemplo em `examples/theme-manifest.json`. `manifest_signature` cobre bytes canônicos JCS/RFC 8785 do manifesto **excluindo o próprio campo de assinatura**; alternativa documentada precisa ser equivalente e testada em Kotlin e TypeScript. O SHA-256 cobre os bytes EXATOS do `.res` em R2, baixados pelo Android. Definir `key_id`, algoritmo (`Ed25519` se adotado), cadeia de confiança e revogação. Não assinar apenas URL de download.

## 5. Cache e compatibilidade
- Cache local da lista, com ETag/TTL e badge de dados desatualizados quando offline; não permitir instalar artefato não validado por assinatura e não conferido contra compatibilidade local.
- Índice composto `{variant_code, hardware_revision, firmware_semver, resource_format_version, locale, driver_version}`: compatibilidade é conjunção de regras, não heurística por substring de nome.
- Não confundir `firmware_semver` e `resources_version`; ambas podem afetar o pacote.
- Font bundle opcional com operação independente e política de permissão distinta; verificar se sistema consegue mantê-lo sem risco.
- Cancelamento de rollout e blacklist de hash: impede **novas instalações**; não remove nem altera temas já instalados silenciosamente.

## 6. Regras Cloudflare
- D1: `wearable_theme_projects`, `wearable_theme_releases`, `wearable_theme_artifacts`, `wearable_theme_compatibility`, `wearable_theme_installs`, `wearable_theme_approvals`, `wearable_theme_revocations`.
- R2: `/themes/{theme_id}/{version}/{variant}/{sha256}.res`, `/themes/{theme_id}/{version}/previews/*`, `/themes/{theme_id}/{version}/manifests/*`; bucket privado. Não usar assinatura de URL como substituto da assinatura do pacote.
- Workers: APIs de catálogo, manifestos e gestão admin; emite URLs curtas autenticadas para R2 e aplica tenant/device scopes.
- Queues: avisos de novas versões, inspeção/compilação, QA assíncrono, auditoria; **nunca** executar OTA na pulseira remotamente.
- Durable Objects/WebSocket: somente progresso de instalação informado pelo Android para console de supervisão, com consentimento. OTA real é BLE local; não injetar chunks de `.res` via WSS.

## 7. Estado de release
`DRAFT → BUILT → VALIDATED_SIMULATOR → HARDWARE_TESTED → APPROVED → PUBLISHED → DEPRECATED/REVOKED`; `QUARANTINED` acessível a qualquer ponto de risco. Toda transição exige ator e evidência; `PUBLISHED` não pode regredir diretamente a DRAFT, gerar release novo. Release com erro conhecido deve ser revogada.

## 8. API e controle de versões
Rotas adicionais estão em `contracts/openapi.yaml`:
- `GET /themes` catálogo com filtros do dispositivo;
- `GET /themes/{themeId}` detalhe;
- `GET /themes/{themeId}/releases/{releaseId}` metadados e manifesto;
- `POST /devices/{deviceId}/theme-installations` pré-registrar intenção autorizada no **telefone**;
- `GET /devices/{deviceId}/theme-installations` histórico;
- `POST /devices/{deviceId}/theme-installations/{installationId}/events` reportar transições/erros assinados pelo gateway;
- `GET /devices/{deviceId}/theme-installations/{installationId}` consultar status;
- `POST /themes/{themeId}/releases/{releaseId}/download-ticket` obter URL temporária;
- `POST /admin/themes` criar projeto;
- `POST /admin/themes/{themeId}/releases` criar release candidato;
- `POST /admin/themes/{themeId}/releases/{releaseId}/approve` dupla aprovação;
- `POST /admin/themes/{themeId}/releases/{releaseId}/publish` disponibilizar release;
- `POST /admin/themes/{themeId}/releases/{releaseId}/revoke` revogar distribuição.

O *ticket* jamais autoriza instalação sozinho; o Android exigirá o consentimento local e o segundo gate de compatibilidade. `POST /.../theme-installations` deve rejeitar chamadas originadas apenas do console com status `LOCAL_CONFIRMATION_REQUIRED` se não houver prova local do gateway.

## 9. Testes de supply chain
- Falso `wuhan.res` renomeado, pacote de outra variante, manifesto expirado, assinatura alterada, pacote modificado depois de download, endpoint com URL manipulada e filename path traversal → rejeitados antes do BLE.
- Pacote compatível mas revogado durante download → instalação bloqueada na revalidação de preflight online; se offline, respeitar política local anti-revogação (instalação por padrão indisponível sem status confiável de revogação).
- Downloads parciais / repetidos idempotentes e cache com checksum estável.
- Rebuild determinístico do mesmo projeto gera mesmo SHA256 (quando algoritmo e entradas idênticos).
- Aprovação de revisor não pode ser efetuada pela mesma identidade do publicador (four-eyes principle).
