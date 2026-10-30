/*
  Arduino Mega 2560 serial protocol example.
  Send a credential event to NodeMCU over Serial3.
  Pin 14 = TX3, pin 15 = RX3.
  Ensure the NodeMCU RX input is level shifted to 3.3V.
*/
void setup() {
  Serial.begin(115200);
  Serial3.begin(9600);
}
void loop() {
  // Replace these sample values with the actual EM-18 UID or fingerprint ID.
  // Example when RFID reader returns a complete UID string:
  // Serial3.println("{\"method\":\"RFID\",\"credential\":\"RFID102\"}");
  // Example after fingerprint sensor returns template ID 1:
  // Serial3.println("{\"method\":\"FINGERPRINT\",\"credential\":\"1\"}");
  delay(1000);
}
