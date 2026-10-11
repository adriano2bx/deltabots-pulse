/* DeltaBots Pulse — firmware de BANCADA (LED / relé de baixa tensão).
 * NÃO COMPILADO nesta sessão (sem ESP-IDF): validar em hardware antes de qualquer alegação (HW11).
 * A lógica de segurança vive em ../core/safety.c e é testada no host. */
#include <stdio.h>
#include <string.h>
#include "cJSON.h"
#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mqtt_client.h"
#include "nvs_flash.h"
#include "safety.h"

static const char *TAG = "pulse";
static ps_t g_ps;
static SemaphoreHandle_t g_lock;
static esp_mqtt_client_handle_t g_mqtt;
static bool g_connected = false;
static char g_topic_cmd[160], g_topic_ack[160], g_topic_status[160];

static uint32_t now_ms(void) { return (uint32_t)(esp_timer_get_time() / 1000); }

static void apply_output(void) { gpio_set_level(CONFIG_PULSE_LED_GPIO, g_ps.output ? 1 : 0); }

static void publish_status(bool online) {
  if (!g_mqtt) return;
  char buf[200];
  snprintf(buf, sizeof buf, "{\"v\":1,\"equipment_id\":\"%s\",\"online\":%s,\"armed\":%s,\"outputs\":{\"led\":%s}}",
           CONFIG_PULSE_EQUIPMENT_ID, online ? "true" : "false", g_ps.state == PS_ARMED ? "true" : "false",
           g_ps.output ? "true" : "false");
  esp_mqtt_client_publish(g_mqtt, g_topic_status, buf, 0, 1, 0);
}

static void publish_ack(const char *command_id, const char *ack, const char *code) {
  char buf[220];
  if (code) snprintf(buf, sizeof buf, "{\"v\":1,\"command_id\":\"%s\",\"equipment_id\":\"%s\",\"ack\":\"%s\",\"code\":\"%s\"}", command_id, CONFIG_PULSE_EQUIPMENT_ID, ack, code);
  else snprintf(buf, sizeof buf, "{\"v\":1,\"command_id\":\"%s\",\"equipment_id\":\"%s\",\"ack\":\"%s\"}", command_id, CONFIG_PULSE_EQUIPMENT_ID, ack);
  esp_mqtt_client_publish(g_mqtt, g_topic_ack, buf, 0, 0, 0);
}

static const char *code_for(ps_result_t r) {
  switch (r) {
    case PS_ERR_DISARMED: return "CONTROL_DISARMED";
    case PS_ERR_EXPIRED: return "COMMAND_EXPIRED";
    case PS_ERR_DUPLICATE: return "DUPLICATE";
    case PS_ERR_BAD_ACTION: return "SAFETY_BLOCKED";
    case PS_ERR_ESTOP: return "SAFETY_BLOCKED";
    case PS_ERR_RATE: return "RATE_LIMITED";
    default: return "INTERNAL_ERROR";
  }
}

/* O expires_at do comando vem em ISO-8601 (UTC). Sem relógio sincronizado (SNTP) o comando é
 * rejeitado — nunca presumimos validade. */
static int32_t expires_in_ms(const char *iso) {
  struct tm tm = {0};
  int ms = 0;
  if (sscanf(iso, "%d-%d-%dT%d:%d:%d.%dZ", &tm.tm_year, &tm.tm_mon, &tm.tm_mday, &tm.tm_hour, &tm.tm_min, &tm.tm_sec, &ms) < 6) return -1;
  tm.tm_year -= 1900; tm.tm_mon -= 1;
  time_t exp = mktime(&tm);
  struct timeval tv; gettimeofday(&tv, NULL);
  if (tv.tv_sec < 1700000000) return -1; /* SNTP ainda não sincronizou */
  return (int32_t)((exp - tv.tv_sec) * 1000 + ms - tv.tv_usec / 1000);
}

static void on_command(const char *data, int len) {
  cJSON *root = cJSON_ParseWithLength(data, len);
  if (!root) return;
  const cJSON *id = cJSON_GetObjectItem(root, "command_id");
  const cJSON *eq = cJSON_GetObjectItem(root, "equipment_id");
  const cJSON *action = cJSON_GetObjectItem(root, "action");
  const cJSON *idem = cJSON_GetObjectItem(root, "idempotency_key");
  const cJSON *exp = cJSON_GetObjectItem(root, "expires_at");
  const cJSON *args = cJSON_GetObjectItem(root, "arguments");
  const cJSON *val = args ? cJSON_GetObjectItem(args, "value") : NULL;
  if (!cJSON_IsString(id) || !cJSON_IsString(eq) || strcmp(eq->valuestring, CONFIG_PULSE_EQUIPMENT_ID) != 0 ||
      !cJSON_IsString(action) || !cJSON_IsString(idem) || !cJSON_IsString(exp) || !cJSON_IsBool(val)) {
    if (cJSON_IsString(id)) publish_ack(id->valuestring, "ACK_REJECTED", "VALIDATION_ERROR");
    cJSON_Delete(root);
    return;
  }
  xSemaphoreTake(g_lock, portMAX_DELAY);
  ps_result_t r = ps_command_set(&g_ps, now_ms(), action->valuestring, cJSON_IsTrue(val), idem->valuestring, expires_in_ms(exp->valuestring));
  apply_output();
  xSemaphoreGive(g_lock);
  if (r == PS_OK) { publish_ack(id->valuestring, "ACK_ACCEPTED", NULL); publish_ack(id->valuestring, "ACK_EXECUTED", NULL); }
  else publish_ack(id->valuestring, "ACK_REJECTED", code_for(r));
  publish_status(true);
  cJSON_Delete(root);
}

static void mqtt_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
  esp_mqtt_event_handle_t e = data;
  switch ((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED:
      g_connected = true;
      esp_mqtt_client_subscribe(g_mqtt, g_topic_cmd, 0);
      publish_status(true);
      break;
    case MQTT_EVENT_DISCONNECTED:
      g_connected = false;
      xSemaphoreTake(g_lock, portMAX_DELAY);
      ps_link_lost(&g_ps); /* perda do broker → desarma e neutraliza */
      apply_output();
      xSemaphoreGive(g_lock);
      break;
    case MQTT_EVENT_DATA:
      if (e->retain) break; /* comando nunca vem de mensagem retida */
      on_command(e->data, e->data_len);
      break;
    default: break;
  }
}

/* Laço de segurança independente da rede: botão de armação, e-stop, watchdog. */
static void safety_task(void *arg) {
  bool btn_prev = true;
  uint32_t last_status = 0;
  for (;;) {
    bool estop = gpio_get_level(CONFIG_PULSE_ESTOP_GPIO) == 1; /* NF: aberto = parada */
    bool btn = gpio_get_level(CONFIG_PULSE_ARM_BUTTON_GPIO) == 0;
    uint32_t t = now_ms();
    xSemaphoreTake(g_lock, portMAX_DELAY);
    ps_set_estop(&g_ps, estop);
    if (btn && btn_prev == false) { /* borda de descida do botão */
      if (g_ps.state == PS_ARMED) ps_local_disarm(&g_ps); else ps_local_arm(&g_ps, t, 120000);
    }
    ps_tick(&g_ps, t);
    apply_output();
    xSemaphoreGive(g_lock);
    btn_prev = !btn ? true : false;
    if (g_connected && t - last_status > 3000) { publish_status(true); last_status = t; }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

static void wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) esp_wifi_connect();
  else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    xSemaphoreTake(g_lock, portMAX_DELAY); ps_link_lost(&g_ps); apply_output(); xSemaphoreGive(g_lock);
    esp_wifi_connect();
  }
}

void app_main(void) {
  g_lock = xSemaphoreCreateMutex();
  ps_init(&g_ps, CONFIG_PULSE_WATCHDOG_MS, 50);
  gpio_config_t out = {.pin_bit_mask = 1ULL << CONFIG_PULSE_LED_GPIO, .mode = GPIO_MODE_OUTPUT};
  gpio_config(&out);
  gpio_set_level(CONFIG_PULSE_LED_GPIO, 0); /* saída neutra desde o boot */
  gpio_config_t in = {.pin_bit_mask = (1ULL << CONFIG_PULSE_ARM_BUTTON_GPIO) | (1ULL << CONFIG_PULSE_ESTOP_GPIO), .mode = GPIO_MODE_INPUT, .pull_up_en = GPIO_PULLUP_ENABLE};
  gpio_config(&in);

  snprintf(g_topic_cmd, sizeof g_topic_cmd, "pulse/v1/%s/%s/cmd", CONFIG_PULSE_TENANT_ID, CONFIG_PULSE_EQUIPMENT_ID);
  snprintf(g_topic_ack, sizeof g_topic_ack, "pulse/v1/%s/%s/ack", CONFIG_PULSE_TENANT_ID, CONFIG_PULSE_EQUIPMENT_ID);
  snprintf(g_topic_status, sizeof g_topic_status, "pulse/v1/%s/%s/status", CONFIG_PULSE_TENANT_ID, CONFIG_PULSE_EQUIPMENT_ID);

  ESP_ERROR_CHECK(nvs_flash_init());
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  esp_netif_create_default_wifi_sta();
  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event, NULL));
  wifi_config_t wc = {0};
  strncpy((char *)wc.sta.ssid, CONFIG_PULSE_WIFI_SSID, sizeof wc.sta.ssid - 1);
  strncpy((char *)wc.sta.password, CONFIG_PULSE_WIFI_PASSWORD, sizeof wc.sta.password - 1);
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));
  ESP_ERROR_CHECK(esp_wifi_start());

  char lwt[200];
  snprintf(lwt, sizeof lwt, "{\"v\":1,\"equipment_id\":\"%s\",\"online\":false}", CONFIG_PULSE_EQUIPMENT_ID);
  esp_mqtt_client_config_t mc = {
      .broker.address.uri = CONFIG_PULSE_MQTT_URI,
      .broker.verification.crt_bundle_attach = NULL, /* use esp_crt_bundle_attach ou CA própria via menuconfig */
      .session.last_will = {.topic = g_topic_status, .msg = lwt, .qos = 1, .retain = 0},
      .session.keepalive = 10,
      .network.disable_auto_reconnect = false,
  };
  g_mqtt = esp_mqtt_client_init(&mc);
  esp_mqtt_client_register_event(g_mqtt, ESP_EVENT_ANY_ID, mqtt_event, NULL);
  esp_mqtt_client_start(g_mqtt);
  xTaskCreate(safety_task, "safety", 4096, NULL, 10, NULL);
  ESP_LOGI(TAG, "iniciado DISARMED; saída neutra");
}
