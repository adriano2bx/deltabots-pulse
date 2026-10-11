# 34 — PRD normativo: temas e atualização da interface da pulseira pelo Android

**Módulo:** `Pulse Wearable UI Engine` · **Prioridade:** produto final, obrigatória · **Requisitos:** F351–F390 · **Telas:** A65–A76.

## 1. Resultado para o usuário
A pessoa conecta sua Mi Band 3 ao DeltaBots Pulse Android, abre **Dispositivos → Mi Band 3 → Personalizar pulseira**, navega pelos temas oficiais DeltaBots, visualiza uma simulação fiel da tela monocromática, escolhe um tema compatível, confere os riscos, confirma a instalação e acompanha a transferência dos recursos visuais **diretamente no aplicativo**. Após a operação, o app reconecta, lê versões/estado disponíveis e apresenta resultado verificado ou **não verificável**. Nunca atribuir sucesso apenas por 100% dos bytes enviados.

O app deverá incluir, sem dependência de outro app para a experiência de usuário, catálogo, prévia, instalação BLE, log sanitizado, diagnóstico, histórico e restauração assistida. **A instalação direta exige um driver próprio validado no hardware de teste; suporte em Gadgetbridge é evidência de viabilidade, não uma implementação existente do DeltaBots Pulse.**

## 2. Distinção essencial entre tipos de atualização
1. **Tema/skin `.res` (caminho preferencial)**: substitui imagens/recursos presentes no firmware original e pode modificar mostradores/ícones existentes. Não cria sistema operacional nem novos menus executáveis; telas DeltaBots propostas são conceitos e só podem aparecer onde o firmware oferecer superfície compatível.
2. **Fonte `.ft` ou variante reconhecida (se necessário)**: gerenciar separadamente por variante/idioma/firmware; nunca anexar automaticamente fonte incompatível.
3. **Firmware `.fw` (modo laboratório/admin separado)**: não faz parte da instalação cotidiana de temas. Deve ficar inacessível na UI de temas; qualquer atualização firmware requer permissão especial, análise de versão e procedimento separado. Não oferecer downgrade/upgrade arbitrário nem sequência presumida.
4. **Notificação dinâmica enviada via BLE**: mensagem/ícone/vibração é um evento efêmero, **não** alteração permanente de interface. Utilizar quando a personalização necessária não couber no `.res`.
5. **Custom watchface independente**: tratar como `UNSUPPORTED` na Mi Band 3 até demonstração documentada. Não assumir suporte aos formatos de gerações posteriores.

## 3. Jornada completa do app
1. Abrir `A65 /devices/{id}/appearance`; ler firmware, revisão HW, variante, battery e capabilities `RESOURCE_UPDATE`, `RESOURCE_VERSION_READ`, `FONT_UPDATE`, `THEME_RESTORE`, `DEVICE_UI_PREVIEW` quando suportadas.
2. Exibir claramente `Compatível`, `Incompatível`, `Ainda não verificado` ou `Temporariamente indisponível`, com motivo e link de diagnóstico; catálogo pode ser explorado mesmo quando instalação indisponível.
3. `A66`: consultar catálogo versionado; buscar/favoritar/filtrar por variante e idioma; nunca sugerir instalação de pacote `REVOKED`, `QUARANTINED`, `DRAFT`.
4. `A67`: abrir detalhe com screenshots/frames 128 × 80 pixels, seções afetadas, antes/depois, versão, autor/licença e observações; comunicar o que NÃO muda.
5. `A68`: selecionar tema; cálculo local+servidor de compatibilidade exata, com confirmação baseada no equipamento conectado, não somente no nome comercial.
6. `A69`: baixar por HTTPS URL temporária, com limites de tamanho, checksum SHA-256, assinatura do manifesto por chave pública confiável e inspeção local. Nunca passar artefato via WSS de telemetria.
7. `A70`: checklist de segurança: autorização do titular, bateria adequada, BLE estável, espaço local, ausência de sessão gestual armada, nenhum firmware/OTA simultâneo, pacote compatível e caminho de recuperação explicado.
8. `A71`: confirmação explícita com identificação do dispositivo, alteração e aviso de risco de inutilização; não consentimento embutido em termos genéricos.
9. `A72`: iniciar transferência usando máquina de estados GATT serializada, com progresso de bytes **confirmados**, fase atual, orientação de não afastar o aparelho, e opção de cancelamento somente quando o protocolo suportar abortar com segurança.
10. `A73`: pós-instalação: aguardar reboot/reconexão se ocorrer, reler versão de recursos se possível e executar checks de funcionamento (pareamento, leitura simples, eventos). Distinguir `VERIFIED_INSTALLED`, `TRANSFER_COMPLETE_UNVERIFIED`, `FAILED`, `RECOVERY_REQUIRED`.
11. `A74`: histórico por dispositivo com status, instante, pacote/hash, firmware anterior/posterior, logs técnicos redigidos e eventuais ações de suporte.
12. `A75`: restaurar somente por **nova instalação de pacote original conhecido, confiável e compatível** se o hardware ainda aceitar BLE. Não prometer rollback transacional ou reflashing automático após falha crítica.
13. `A76`: diagnóstico e fluxo de recuperação guiada; preservar logs, suspender novas tentativas, instruções para reemparelhar ou assistência. A UI não deve exigir que o usuário use Gadgetbridge, mas pode mencionar procedimento alternativo como referência de suporte se juridicamente e tecnicamente adequado.

## 4. Requisitos funcionais por subtópico
### 4.1 Catálogo, prévia e personalização
- Temas oficiais DeltaBots (por exemplo `Pulse Mono`, `Pulse Tactical`, `Pulse Minimal`) representados por *artefatos reais somente quando compilados, revisados e assinados*. Entradas em design não são oferecidas como instaláveis.
- Status `draft → validated_in_simulator → hardware_tested → published → deprecated/revoked` com segregação staging/prod.
- Prévia monocromática 128×80, alto contraste, sem simular tela colorida no hardware; indica limitações gráficas e idioma.
- Permitir exportar/importar design em modo desenvolvedor; importar pacote `.res` manual apenas com consentimento e a mesma verificação de compatibilidade que pacotes oficiais. Pacote de origem não confiável deve ser **rejeitado** para instalação direta na versão comercial, mesmo que possa ser aberto em visualizador isolado.
- Editor no console para inserir imagens/frames, mapear slots de recurso validados e compilar templates suportados. Não alegar capacidade de compilar quaisquer `.res` não documentados.

### 4.2 Gate de compatibilidade rigoroso
- Identificar no aparelho `model`, `hardware_revision`, `variant_code` (`wuhan`/`hankou`/`chongqing` ou desconhecida), `firmware_version`, `resource_version` quando legível, `auth_state`, `device_capabilities`, `driver_version`.
- Pacote declara lista EXATA de variantes/revisões/intervalos de firmware e formato esperado; pacote `wuhan` nunca deve ser instalado em `hankou` ou `chongqing` apenas porque ambos se chamam Mi Band 3.
- Campo faltante ou desconhecido crítico implica `COMPATIBILITY_UNVERIFIED`, com botão de instalar indisponível, **sem override de risco** em produto comercial.
- Checar conflito de fonte/idioma quando o bundle exigir `.ft`; proibir cadeia incompleta `.fw`/`.res`/`.ft`.
- Campo `required_transfer_protocol_version` e `min_driver_version` faz parte do manifesto.

### 4.3 Segurança da atualização
- A instalação é sempre solicitada diretamente pelo usuário no celular, inclusive quando o tema for escolhido no Console. **Servidor nunca força OTA silenciosamente**. Intenção remota só cria sugestão para aprovação local.
- Operação exige autenticação de conta válida e autorização como titular ou papel delegado explicitamente `device.theme.install`; verificar possuidor físico conectado à pulseira.
- Política padrão: bateria da pulseira **≥50%**, celular **≥30%**, bateria detectável, Bluetooth ativo, conexão autenticada, sem áudio/chamada/controle crítico ativo. Limiares são política conservadora inicial, a validar experimentalmente; nunca vender como exigência do fabricante.
- Download temporário do R2 com URL de acesso escopada e expiração curta; manifesto assinado (ex. Ed25519, algoritmo e rotação controlados), hash de conteúdo, teto de tamanho e sem execução de código enviado pelo pacote.
- Bundle protegido contra troca após aprovação: hash e versão fixados no início da sessão; impedir TOCTOU, revogação de manifesto deve impedir novas instalações.
- Limite de operações por dispositivo, mutex entre sync/OTA/stream, e revogação de sessão remota/gestos; watchdog dos equipamentos físicos independente.
- Nunca embutir `.fw`/`.res` proprietários obtidos de APK de terceiros no app/servidor sem direito de redistribuição; armazenar origem, direito de uso, autor e licença de cada artefato.
- Nenhum Worker/IA/MCP pode disparar BLE flash sem confirmação humana **no telefone físico**.

### 4.4 Diagnóstico e recuperação honestos
- Separar `download`, `validation`, `preflight`, `transfer`, `device_processing`, `reconnect`, `postcheck`.
- O Android persiste progresso por etapa e um `attempt_id` imutável; após process kill, reabre status `INTERRUPTED` e reconcilia com estado real antes de permitir novas tentativas.
- Tentativa interrompida no meio **não** admite continuidade por offset a menos que uma capability específica de retomada tenha sido comprovada; não repetir blocos de forma cega.
- Restauração é nova atualização de um pacote original autorizado, não snapshot extraído automaticamente do firmware existente; se não houver um original legalmente obtido/compatível ou o BLE não funcionar, apresentar indisponibilidade e assistência técnica.
- Registrar falhas (`BLE_DISCONNECTED`, `HASH_MISMATCH`, `SIGNATURE_INVALID`, `COMPATIBILITY_MISMATCH`, `BATTERY_LOW`, `TRANSFER_REJECTED`, `POSTCHECK_UNVERIFIED`, `RECOVERY_REQUIRED`) com códigos estáveis e orientações em pt-BR.

## 5. Interfaces no Console Cloudflare
`/console/wearable-themes` lista temas e versões; `/console/wearable-themes/new` abre editor com prévia 128x80; `/console/wearable-themes/{id}` apresenta imagens, pacote/assinatura, revisão, direitos e testes; `/console/wearable-themes/{id}/releases` gerencia publicação canary/produção; `/console/devices/{id}/appearance` apresenta compatibilidade e histórico (sem comando flash remoto). Todas as ações admin exigem MFA, RBAC, dupla aprovação para publicação e trilha de auditoria.

## 6. Casos de borda obrigatórios
Bluetooth desligado ou perdido, aplicativo morto por OEM, troca de Wi-Fi/4G, firmware variante desconhecida, clone, baixa bateria, SHA errado, assinatura inválida, erro CCCD/MTU, sem autorização do titular, pacote revogado após download, usuário sai do app, rotação de credencial Cloudflare, idioma exige `.ft` incompatível, fonte perdida, atualização completada mas versão não legível, reboot sem reconexão, usuário tenta atualizar dois dispositivos, dupla confirmação da mesma operação, importação de arquivo com extensão `.res` mas conteúdo inesperado.

## 7. Pronto para produção (sem reduzir escopo)
- Todos os fluxos A65–A76 implementados e acessíveis, inclusive prévia offline, estados de erro e recuperação; contratos, worker, editor e backoffice operantes.
- Pelo menos **um pacote de recursos DeltaBots efetivamente compatível com uma variante/firmware real** compilado, assinado e aplicado em unidade de laboratório, com prova em vídeo/log e inspeção da interface após reconexão; caso não seja possível no hardware disponível, `BLOCKED_HARDWARE`, **nunca `PASS`**.
- Testes comparativos de recursos originais, uso de bateria, reinicialização, sincronização de passos/HR e notificações depois da alteração; sem regressões não documentadas.
- Demonstração de incompatibilidade bloqueada e tentativa adulterada/revogada rejeitada em testes automatizados.
- Nenhum algoritmo de rollback, resume ou validação de versão é declarado comprovado sem evidência de protocolo/hardware.

## 8. Referências verificadas
- Gadgetbridge Mi Band 3: https://gadgetbridge.org/internals/specifics/mi-band-3/
- Gadgetbridge instalador: https://gadgetbridge.org/internals/features/installer/
- Gadgetbridge repositorio atual / AGPLv3: https://codeberg.org/Freeyourgadget/Gadgetbridge

## 9. Resumo de interfaces obrigatórias
`WearableResourceInspector`, `ThemeCompatibilityService`, `ThemeManifestVerifier`, `ThemeCatalogRepository`, `WearableResourceUpdater`, `ThemeInstallCoordinator`, `ThemeUpdateJournal`, `WearablePostInstallVerifier`, `ThemeRecoveryAdvisor`, `ThemeSigningService` (backend), `ThemeReleaseService` (backend), `ThemeStudioCompiler` (console/worker de build controlado). Implementações devem ser injetáveis e ter testes com fixture BLE e manifestos malformados.
