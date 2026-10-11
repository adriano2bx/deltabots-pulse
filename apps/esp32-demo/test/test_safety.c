#include "../core/safety.h"
#include <stdio.h>

static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FALHOU %s:%d %s\n", __FILE__, __LINE__, #c); fails++; } } while (0)

int main(void) {
  ps_t s;
  ps_init(&s, 1500, 50);
  CHECK(s.state == PS_DISARMED && !s.output);                                   /* startup desarmado */
  CHECK(ps_command_set(&s, 100, "set_led", true, "k1", 500) == PS_ERR_DISARMED); /* T006 */

  ps_local_arm(&s, 1000, 60000);
  CHECK(ps_command_set(&s, 1100, "set_led", true, "k1", 500) == PS_OK && s.output);
  CHECK(ps_command_set(&s, 1200, "set_led", false, "k1", 500) == PS_ERR_DUPLICATE); /* T007 */
  CHECK(s.output);                                                                  /* duplicado não atua */
  CHECK(ps_command_set(&s, 1300, "set_led", false, "k2", 0) == PS_ERR_EXPIRED);      /* T008 */
  CHECK(ps_command_set(&s, 1310, "set_led", false, "k3", -5) == PS_ERR_EXPIRED);
  CHECK(ps_command_set(&s, 1320, "open_gate", true, "k4", 500) == PS_ERR_BAD_ACTION); /* allowlist */
  CHECK(ps_command_set(&s, 1120, "set_led", true, "k5", 500) == PS_ERR_RATE);        /* taxa máxima */

  CHECK(!ps_tick(&s, 2000) && s.output);   /* dentro do watchdog */
  CHECK(ps_tick(&s, 2700) && !s.output);   /* T009: sem comando válido → neutraliza */
  CHECK(s.state == PS_ARMED);              /* continua armado, saída neutra */

  ps_command_set(&s, 3000, "set_led", true, "k6", 500);
  ps_link_lost(&s);                         /* perda do broker */
  CHECK(s.state == PS_DISARMED && !s.output);

  ps_local_arm(&s, 5000, 60000);
  ps_command_set(&s, 5100, "set_led", true, "k7", 500);
  ps_set_estop(&s, true);                   /* e-stop vence tudo */
  CHECK(!s.output && s.state == PS_DISARMED);
  ps_local_arm(&s, 5200, 60000);
  CHECK(s.state == PS_DISARMED);            /* não arma com e-stop */
  CHECK(ps_command_set(&s, 5300, "set_led", true, "k8", 500) == PS_ERR_ESTOP);
  ps_set_estop(&s, false);

  ps_local_arm(&s, 10000, 1000);
  CHECK(ps_tick(&s, 11001) == false && s.state == PS_DISARMED); /* armação expira sozinha */

  /* wrap-around de 32 bits no relógio */
  ps_init(&s, 1500, 10);
  ps_local_arm(&s, 0xFFFFFF00u, 100000);
  CHECK(ps_command_set(&s, 0xFFFFFF10u, "set_led", true, "w1", 500) == PS_OK);
  CHECK(ps_tick(&s, 0x00000600u) && !s.output); /* watchdog através do wrap */

  if (fails) { printf("%d falha(s)\n", fails); return 1; }
  printf("OK: núcleo de segurança\n");
  return 0;
}
