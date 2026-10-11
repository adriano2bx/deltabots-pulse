/* Núcleo de segurança do equipamento de bancada — C puro, sem ESP-IDF, testável no host.
 * Regras (docs/08): inicia DISARMED; só atua com armação LOCAL (botão); comandos expiram;
 * idempotência por chave; watchdog neutraliza a saída sem comando válido; e-stop sempre vence. */
#ifndef PULSE_SAFETY_H
#define PULSE_SAFETY_H

#include <stdbool.h>
#include <stdint.h>

#define PULSE_IDEM_CACHE 16
#define PULSE_IDEM_LEN 48

typedef enum { PS_DISARMED = 0, PS_ARMED = 1 } ps_state_t;

typedef enum {
  PS_OK = 0,
  PS_ERR_DISARMED,
  PS_ERR_EXPIRED,
  PS_ERR_DUPLICATE,
  PS_ERR_BAD_ACTION,
  PS_ERR_ESTOP,
  PS_ERR_RATE
} ps_result_t;

typedef struct {
  ps_state_t state;
  bool estop;          /* interruptor físico: bloqueia tudo */
  bool output;         /* saída atual (LED/relé de baixa tensão) */
  uint32_t watchdog_ms;
  uint32_t armed_until_ms;   /* armação expira sozinha */
  uint32_t last_valid_cmd_ms;
  uint32_t last_cmd_ms;
  uint32_t min_interval_ms;
  char idem[PULSE_IDEM_CACHE][PULSE_IDEM_LEN];
  uint8_t idem_next;
} ps_t;

void ps_init(ps_t *s, uint32_t watchdog_ms, uint32_t min_interval_ms);

/* Botão físico: alterna armação (com duração máxima). Nunca vem da rede. */
void ps_local_arm(ps_t *s, uint32_t now_ms, uint32_t arm_ms);
void ps_local_disarm(ps_t *s);
void ps_set_estop(ps_t *s, bool pressed);

/* Comando "set_led": value 0/1. expires_in_ms = tempo restante calculado pelo chamador. */
ps_result_t ps_command_set(ps_t *s, uint32_t now_ms, const char *action, bool value,
                           const char *idem_key, int32_t expires_in_ms);

/* Chamar periodicamente: aplica watchdog e expiração da armação. Retorna true se a saída mudou. */
bool ps_tick(ps_t *s, uint32_t now_ms);

/* Perda de rede/broker: desarma e neutraliza imediatamente. */
void ps_link_lost(ps_t *s);

#endif
