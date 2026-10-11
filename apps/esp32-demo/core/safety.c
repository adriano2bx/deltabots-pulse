#include "safety.h"
#include <string.h>

void ps_init(ps_t *s, uint32_t watchdog_ms, uint32_t min_interval_ms) {
  memset(s, 0, sizeof(*s));
  s->state = PS_DISARMED; /* startup sempre desarmado */
  s->watchdog_ms = watchdog_ms;
  s->min_interval_ms = min_interval_ms;
}

static void neutralize(ps_t *s) { s->output = false; }

void ps_local_arm(ps_t *s, uint32_t now_ms, uint32_t arm_ms) {
  if (s->estop) return;
  s->state = PS_ARMED;
  s->armed_until_ms = now_ms + arm_ms;
  s->last_valid_cmd_ms = now_ms;
}

void ps_local_disarm(ps_t *s) {
  s->state = PS_DISARMED;
  neutralize(s);
}

void ps_set_estop(ps_t *s, bool pressed) {
  s->estop = pressed;
  if (pressed) ps_local_disarm(s);
}

void ps_link_lost(ps_t *s) { ps_local_disarm(s); }

static bool idem_seen(const ps_t *s, const char *key) {
  for (int i = 0; i < PULSE_IDEM_CACHE; i++)
    if (s->idem[i][0] && strncmp(s->idem[i], key, PULSE_IDEM_LEN - 1) == 0) return true;
  return false;
}

ps_result_t ps_command_set(ps_t *s, uint32_t now_ms, const char *action, bool value,
                           const char *idem_key, int32_t expires_in_ms) {
  if (s->estop) return PS_ERR_ESTOP;
  if (s->state != PS_ARMED) return PS_ERR_DISARMED;
  if (!action || strcmp(action, "set_led") != 0) return PS_ERR_BAD_ACTION;
  if (expires_in_ms <= 0) return PS_ERR_EXPIRED; /* nunca executa comando vencido */
  if (!idem_key || !idem_key[0]) return PS_ERR_BAD_ACTION;
  if (idem_seen(s, idem_key)) return PS_ERR_DUPLICATE; /* no máximo 1 atuação por chave */
  if (s->last_cmd_ms != 0 && now_ms - s->last_cmd_ms < s->min_interval_ms) return PS_ERR_RATE;
  strncpy(s->idem[s->idem_next], idem_key, PULSE_IDEM_LEN - 1);
  s->idem[s->idem_next][PULSE_IDEM_LEN - 1] = 0;
  s->idem_next = (uint8_t)((s->idem_next + 1) % PULSE_IDEM_CACHE);
  s->output = value;
  s->last_cmd_ms = now_ms;
  s->last_valid_cmd_ms = now_ms;
  return PS_OK;
}

bool ps_tick(ps_t *s, uint32_t now_ms) {
  bool before = s->output;
  if (s->state == PS_ARMED) {
    if ((int32_t)(now_ms - s->armed_until_ms) >= 0) ps_local_disarm(s);       /* armação expirou */
    else if (now_ms - s->last_valid_cmd_ms >= s->watchdog_ms) neutralize(s);  /* watchdog */
  }
  return before != s->output;
}
