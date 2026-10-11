# 32 — Wireflows e critérios UI detalhados

## Fluxo instalação → dispositivo
```mermaid
flowchart TD
 A[Splash]-->B{Sessão válida?}
 B--não-->C[Onboarding / Auth]
 B--sim-->D[Home]
 C-->E[Consentimentos]
 E-->F[Permissões contextuais]
 F-->G[Busca BLE]
 G-->H{Encontrou?}
 H--não-->I[Retry / Diagnóstico]
 H--sim-->J[Parear e autenticar]
 J-->K{Autorizado?}
 K--não-->L[Explicação de chave/erro]
 K--sim-->M[Probing capacidades firmware]
 M-->N[Sync inicial]
 N-->D
```

## Fluxo gesto seguro
```mermaid
flowchart TD
 A[Laboratório]-->B{raw accel SUPPORTED?}
 B--não-->C[Indisponível para Mi Band 3; outro sensor explícito]
 B--sim-->D[Calibrar/gravar/avaliar]
 D-->E{Modelo aprovado?}
 E--não-->D
 E--sim-->F[Selecionar equipamento permitido]
 F-->G[Confirmar arm local + duração]
 G-->H[Conectar WSS + gateway]
 H-->I{Todos online/policy válida?}
 I--não-->J[DISARMED]
 I--sim-->K[Detectar gesto local]
 K-->L{Confiança+quality+TTL válidos?}
 L--não-->K
 L--sim-->M[Enviar gesture.detected]
 M-->N[Validar policy e emitir control.command]
 N-->O[ACK real do gateway físico]
 O-->P[Feedback e audit]
 P-->K
```

## Estados e microcopy padrão
- `UNVERIFIED`: 'Este modelo/firmware ainda não teve o envio contínuo de movimentos validado. O controle por gestos está desativado.'
- `STALE`: 'Última atualização: há X minutos. Os dados podem não refletir o momento atual.'
- `BLE_DENIED`: 'Para conectar sua pulseira, permita dispositivos próximos nas configurações.'
- `OFFLINE`: 'Sem conexão com a nuvem. Seus dados permanecerão neste aparelho e serão sincronizados ao retornar a internet.'
- `DISARMED`: 'Controle remoto desativado. Os movimentos não acionam equipamentos.'
- `CONTROL_REJECTED`: 'Comando não executado: sessão expirada ou autorização insuficiente.'
- `LOW_QUALITY`: 'Leitura com baixa qualidade; não será usada para acionar alertas.'

## Testes visuais
Criar screenshot/golden Compose para A01–A76 (normal/empty/error/unsupported) e Playwright snapshots do console em larguras 360, 768, 1280, 1920; legibilidade em pt-BR, font scale, contraste e teclado.

## Fluxo de temas e atualização
```mermaid
flowchart TD
 A[Dispositivo - Personalizar]-->B[Catalogo e previa 128x80]
 B-->C[Verificar variante e firmware]
 C-->D{Compatibilidade comprovada?}
 D--Nao-->E[Mostrar indisponibilidade]
 D--Sim-->F[Baixar e validar assinatura/hash]
 F-->G{Preflight bateria e BLE OK?}
 G--Nao-->H[Explicar motivo e bloquear]
 G--Sim-->I[Confirmacao local explicita]
 I-->J[Instalacao BLE com GATT exclusivo]
 J-->K[Reconexao e pos-verificacao]
 K-->L{Verificado?}
 L--Sim-->M[Installed verified e historico]
 L--Nao-->N[Inconclusivo ou falha: recuperacao guiada]
```
Todas as transições remotas de status exigem `attempt_id` e só podem relatar (não iniciar) flash. Fonte de verdade do progresso é journal Android e ACK do dispositivo.
