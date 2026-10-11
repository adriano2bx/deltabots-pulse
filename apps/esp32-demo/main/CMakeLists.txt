idf_component_register(
  SRCS "main.c" "../core/safety.c"
  INCLUDE_DIRS "." "../core"
  REQUIRES esp_wifi esp_event nvs_flash mqtt driver esp_timer json esp_netif
)
