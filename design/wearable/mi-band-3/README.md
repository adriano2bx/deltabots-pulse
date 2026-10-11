# Mi Band 3: monocromático 80 × 128 (portrait)

Os arquivos `png-1bit/*.png` são imagens de design, **não** pacotes `.res` instaláveis.
O display é retratado no sentido vertical como 80×128, equivalente às dimensões 128×80 geralmente citadas em orientação invertida.
Nem todas essas telas poderão existir no firmware original. Especialmente `gesture_*`, `command_*`, `cloud_*`, `recovery` são **concept screens**; em hardware, implementar por notificações e slots suportados após mapeamento e validação.

## Produção real
1. Identificar modelo, firmware e hardware revision no BLE; obter recursos `.res` de origem permitida.
2. Extrair e mapear slots de recursos **originais** por variante Wuhan, Hankou, Chongqing.
3. Verificar dimensões, índice, contagem, formato, capacidade da memória e consistência dos recursos do pacote.
4. Substituir SOMENTE slots comprovados; preservar número e ordem quando exigido pelo empacotador.
5. Assinar manifesto, homologar em equipamento de laboratório e executar testes OTA no Android.
6. O app deve bloquear tentativa sem dados verificados ou quando theme-release não estiver `hardware_tested`.

**Nunca renomeie PNG para .res nem trate SVG como firmware.** Sem binário original autorizado, não é possível fornecer `.res` válido e universal.
