# 21 — Plano de validação Mi Band 3 e hardware de laboratório

## Material
1 Mi Band 3 com firmware identificado, smartphone Android com BLE, cable de recarga, app internal testing assinado, opcional nRF Connect para inspeção autorizada, broker/gateway ESP32 de bancada LED baixa tensão, Wi-Fi + rede móvel de teste. 2+ firmwares e aparelhos desejáveis. Coletar apenas dados com consentimento do titular.

## Matriz experimento
| ID | Ensaio | Prova requerida |
|---|---|---|
| HW01 | Discovery e autenticação | GATT dump sanitarizado + firmware + vídeo |
| HW02 | Heart-rate on-demand | timestamps e comparação à UI pulseira |
| HW03 | Passos sincronizados | contadores/estabilidade e correção de rollover |
| HW04 | Sono histórico | intervalos/coerência e limitações declaradas |
| HW05 | Bateria | nivel vs pulseira e evento |
| HW06 | Vibration | confirmação perceptível e propriedades |
| HW07 | Reconnect/kill | 30 ciclos, tempos e erros |
| HW08 | Raw X/Y/Z | série medida Hz, dados rotulados, jitter, perdas |
| HW09 | Gesture classifier | holdout test e false positives/h |
| HW10 | WSS gateway→Cloudflare | traces e RTT p50/p95/p99 |
| HW11 | IoT command ACK | ordem, TTL, cancelamento, watchdog |
| HW12 | Offline→sync | contagem íntegra + idempotência |
| HW13 | Battery & thermal | carga/consumo em 3 modos |
| HW14 | Background >8h | Android policy, app kill, graceful recover |
| HW15 | Long session failure | stop at network partition, no stale control |

## Critérios objetivos de raw stream
Característica GATT existente, subscribe seguro comprovado, frames parseáveis X/Y/Z, unidade/eixos verificados, amostras úteis em ≥3 sessões com diferentes movimentos, taxa efetiva suficiente para classes escolhidas, sem crashes e consumo aceitável. Se não existir: `UNSUPPORTED` com logs; não usar dados falsos. Se só eventos de passos estiverem disponíveis, limitar ação ao que é comprovado.

## Regras de ensaio
Não instalar firmware desconhecido, não forçar bootloader/OTA experimental em dispositivo do cliente, não usar payloads BLE aleatórios. Experimentos em dispositivo próprio/autorizado. Equipamentos externos somente baixa tensão e mecanismos de parada local.

## Testes adicionais de recursos gráficos Mi Band 3 (HW16–HW24)
| ID | Ensaio | Evidência obrigatória |
|---|---|---|
| HW16 | Identificar wuhan/hankou/chongqing e revisão | leitura do firmware real e mapeamento verificado |
| HW17 | Verificar resource flash capability e serviço OTA | captura BLE sanitizada e app sem terceiros |
| HW18 | Instalar `.res` DeltaBots em unidade de laboratório | hash manifesto, progresso, vídeo antes/depois |
| HW19 | Pós-instalação: conectividade, HR/passos/sono/notificações | relatório sem regressões críticas |
| HW20 | Falha/desconexão controlada sem brick | relato claro de status e recuperação possível ou não |
| HW21 | Idiomas e fontes compatíveis quando pacote requer | screenshots/inspeção, sem menus em branco |
| HW22 | Reflash do recurso original licenciado (se possível) | prova física sem prometer rollback transacional |
| HW23 | Repetição de instalações na matriz firmware/revisão | dados de estabilidade e autonomia, erros categorizados |
| HW24 | Segurança: rejeitar variante errada, adulteração, revogação | logs mostrando zero flash incompatível |
**Gate:** instalação real só `PASS` para matriz de hardware homologada; sem banda na bancada = `BLOCKED_HARDWARE`. Arquivos proprietários não devem ser redistribuídos sem direitos.
