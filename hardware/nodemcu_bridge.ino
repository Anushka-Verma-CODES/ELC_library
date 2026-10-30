/*
  ESP8266 NodeMCU -> Flask Smart Library hardware bridge (example).
  Arduino Mega sends one line of JSON over UART3:
    {"method":"RFID","credential":"RFID102"}
  or
    {"method":"FINGERPRINT","credential":"1"}

  Mega TX3 (pin 14) -> NodeMCU RX through a 5V-to-3.3V level shifter/divider.
  NodeMCU TX -> Mega RX3 (pin 15). Common GND is required.
  Do not connect 5V logic directly to ESP8266 pins.
*/
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_URL = "http://192.168.1.10:5000/api/hardware/scan";
const char* HARDWARE_KEY = "replace-with-your-hardware-secret";

void setup() {
  Serial.begin(115200); // USB debug
  Serial1.begin(9600);  // ESP8266 TX-only debug on some boards; optional
  // Use SoftwareSerial or a suitable UART arrangement for Mega bridge input.
  // ESP8266 has limited hardware UARTs. For a reliable build, use a
  // 3.3V-compatible UART adapter/SoftwareSerial on safe GPIO pins.
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(400); }
  Serial.println("WiFi connected");
}

void postScan(const String& method, const String& credential) {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClient client;
  HTTPClient http;
  http.begin(client, API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Hardware-Key", HARDWARE_KEY);
  String body = "{\"method\":\"" + method + "\",\"credential\":\"" + credential + "\"}";
  int code = http.POST(body);
  Serial.printf("API response: %d\n", code);
  Serial.println(http.getString());
  http.end();
}

void loop() {
  // Demonstration only: replace this serial line reader with your verified
  // Mega-to-NodeMCU UART receiver and forward its parsed credential.
  delay(1000);
}
