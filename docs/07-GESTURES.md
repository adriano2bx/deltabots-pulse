# 07 — Pulse Gesture Engine: ciência de dados, reconhecimento, UX e segurança

## Premissa e gating
O motor deve ser implementado integralmente como subsistema agnóstico a hardware. Na Mi Band 3, captura IMU X/Y/Z só é habilitada com prova da capability real `raw_accel_stream`. Se ausente, laboratório pode funcionar com sensor do Android ou outro wearable com rótulo explícito; **não apresentar gestos como capturados da Mi Band 3**.

## Modes
- `OBSERVE` — preview local / apenas insights; sem atuadores.
- `RECORD` — capturas consentidas para datasets do titular, armazenadas local + R2 somente após consentimento.
- `CALIBRATE` — descobrir orientação do eixo, bias e gravidade estimada.
- `TRAIN` — gerar features e modelos locais, validação cruzada temporal e por usuário.
- `RECOGNIZE_LOCAL` — inferência no Android e envio de evento leve.
- `RECOGNIZE_CLOUD_LAB` — envio high-rate limitado a sessões de laboratório, sem atuação direta.
- `CONTROL_ARMED` — executar comandos se hardware/usuário/equipamento/sessão forem elegíveis.

## Pipeline de sinal
`BLE bytes → parser validado → ts monotônico → escala e unidades m/s² → diagnóstico (jitter/dropout) → filtro passa-baixa/gravity component → janela sliding adaptativa (sugestão 500–1500ms; 50% overlap) → normalização/orientação → features → classificador → confidence+out-of-distribution gate → debounce/refractory → policy → WSS`.

Features candidatas: média/std/RMS, pico e vales por eixo, jerk, variação de energia, magnitude normalizada, zero-crossing, correlação intereixos, espectro/FFT onde taxa suportar, DTW template e temporal CNN/TFLite opcional se datasets suficientes; benchmarks com baseline deterministic template primeiro. Isolar treino de inferência, gerenciar `model_version`, `training_dataset_hash`, rótulos e consentimento.

## Vocabulário inicial de gestos (candidatos não comprovados)
`wrist_left`, `wrist_right`, `wrist_up`, `wrist_down`, `double_flick`, `hold_still`, `tap_pattern` (se perceptível), `rotate_like` (somente aproximado sem giroscópio). Nunca vender como 'rotacionar preciso em 3D'. UI mostra confiança, falsos positivos e estado DISARMED.

## Datasets
Usuário grava 20–50 repetições por classe e ≥2x amostras de não gestos em variados contextos (andar, lavar mãos, dirigir, dormir); variar mão dominante, posição, bateria, firmware e modo BLE. Treino/teste separados por sessões e períodos (não random frames correlacionados); relatório classe/matriz de confusão, balanced accuracy, precisão, revocação, false activations/hora, latência mediana/p95/p99, throughput e bateria.

## Critérios de habilitação gestual para atuação
- Detecta capability raw real; captura sustentada e autorizada.
- Registro de datasets com consentimento e sem vazamento entre usuários.
- Baseline experimental alvo para 4 gestos: precisão macro ≥95%, recall ≥90% em sessão separada e falsas ativações ≤1/8h em rotina real; meta sujeita a revisão baseada em risco, não uma capacidade prometida da Mi Band 3.
- Dois fatores de intenção para ações relevantes: arm explícito + gesto; optionally confirmação no Android (para fechaduras, por exemplo não permitir no escopo inicial).
- Sessão desarmada em 15s sem heartbeat/WS perdido (config), app em background sem FGS autorizado, ambiguidade, baixa confiança, movimento brusco inesperado ou sinal insuficiente.
- Nunca mapear um gesto diretamente a operação safety-critical.

## Ações e semânticas
Distinguir `discrete` (toggle light com idempotency), `continuous` (velocidade/servo em throttle e watchdog local), `approval_required` (solicitação para intervenção humana), `non_actuating` (notificação). Para controle contínuo, usar modelo de velocidade-alvo TTL curto, não rajadas de posições acumuladas; gateway local força neutro quando sem atualizações.

## Relatórios no produto
Gráficos 3 eixos, Hz efetivos, dropouts, classificação, confidence, contagem por classe, matriz de confusão, trace por comando, medição de latência, roteamento, custos. Export CSV/JSON anonimizável. Permitir exclusão completa de treinamentos e modelos.

## Performance
Preferir inferência embarcada; evitar IA generativa em hot path e evitar banco síncrono por gesto. Coleta de amostras em bursts; app throttling UI; benchmark por SKU de Android. Feedback háptico limitado ao suportado pelo firmware.
