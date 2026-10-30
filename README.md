# LibraryFlow — Smart Library Management System

Responsive React + Vite frontend, Flask REST API, SQLite database, booking scheduler, and a hardware scan endpoint for the Arduino Mega + NodeMCU prototype.

## Implemented project rules

- Exactly 10 demo seats: A01–A10.
- Student and administrator accounts.
- Seat reservations for date/time ranges.
- A seat cannot be reserved by two students for overlapping time ranges.
- A student cannot make overlapping bookings.
- Initial check-in is allowed from the reservation start through the 15-minute grace deadline.
- If a student does not check in by the deadline, the reservation is automatically cancelled and the seat is released.
- A successful check-in changes the booking to `OCCUPIED`.
- A reminder notification is created 15 minutes before the booking ends.
- The student can renew from the app if the next time range is free. The booking remains `OCCUPIED`; no second scan is required.
- If a checked-in booking reaches its end without renewal, it becomes `OVERDUE`, but the seat remains occupied until a verified exit scan.
- A verified exit changes the booking to `COMPLETED` and releases the seat.
- Admin dashboard, attendance event history, student list, and seat maintenance toggles.
- Hardware API accepts RFID or fingerprint credential events from a trusted NodeMCU device.

## Demo credentials

| Role | Login ID | Password |
|---|---|---|
| Student | `102` | `Student@123` |
| Student | `103` | `Student@123` |
| Admin | `admin` | `Admin@123` |

Demo RFID credentials:
- Student 102: `RFID102`
- Student 103: `RFID103`

Demo fingerprint template IDs:
- Student 102: `1`
- Student 103: `2`

These are prototype credentials only. Change them before deployment.

## Requirements

- Python 3.10+
- Node.js 18+
- npm

## Run the backend

Open a terminal:

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:
```powershell
.venv\Scripts\Activate.ps1
```

macOS/Linux:
```bash
source .venv/bin/activate
```

Install dependencies and configure environment:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env`, then set strong values for `SECRET_KEY` and `HARDWARE_API_KEY`.

Start Flask:

```bash
python app.py
```

Backend runs at `http://localhost:5000`. SQLite database is created automatically at first run.

## Manual entry/exit simulation

Keep Flask running, then open a second terminal and run the manual command loop from the backend directory:

```powershell
cd backend
python manual_commands.py
```

Use `LIST STUDENTS` to display registered student IDs and use one of those IDs:

```text
LIBRARY > LIST STUDENTS
LIBRARY > ENTER <student_id>
LIBRARY > STATUS <student_id>
LIBRARY > EXIT <student_id>
```

The terminal uses the same booking services and SQLite database as the React API and RFID/fingerprint scans. It does not expose a manual HTTP endpoint. Type `HELP` for commands or `QUIT` to exit. To run the included backend tests:

```powershell
python -m unittest discover -s tests -v
```

## Run the React frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env` if needed. For local development it should contain:

```env
VITE_API_URL=http://localhost:5000/api
```

Start Vite:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Hardware integration protocol

NodeMCU sends:

```http
POST /api/hardware/scan
X-Hardware-Key: YOUR_HARDWARE_API_KEY
Content-Type: application/json
```

RFID body:
```json
{"method":"RFID","credential":"RFID102"}
```

Fingerprint body:
```json
{"method":"FINGERPRINT","credential":"1"}
```

The backend maps the credential to a registered student. If that student has an active occupied/overdue booking, the scan is treated as exit. Otherwise it attempts check-in against that student's reserved booking and validates the 15-minute window.

The response includes `action`, `student_id`, `seat_id`, and booking details. NodeMCU can use this response to drive a buzzer/LED and the LCD can refresh from the backend's current seat data.

### Electrical safety

- Mega TX3 is 5V logic; ESP8266 RX is 3.3V logic. Use a proper level shifter or resistor divider on Mega TX3 -> ESP8266 RX.
- Common GND is required.
- Power the NodeMCU from a stable supply suitable for ESP8266 current peaks; do not power it from the Mega 3.3V output.
- Confirm the exact fingerprint sensor pinout and voltage before wiring.
- The included `.ino` files are protocol examples, not a finished board-specific firmware. Adapt the UART receiver to the actual EM-18 output and fingerprint module library/pinout.

## API overview

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/seats?start=...&end=...`
- `GET /api/bookings`, `POST /api/bookings`
- `POST /api/bookings/<id>/cancel`
- `POST /api/checkin`, `POST /api/checkout`
- `POST /api/bookings/<id>/renew`
- `GET /api/notifications`, `POST /api/notifications/<id>/read`
- `GET /api/admin/overview`, `/api/admin/bookings`, `/api/admin/attendance`, `/api/admin/students`
- `POST /api/admin/seats/<seat_id>/toggle`
- `POST /api/hardware/scan` (hardware API key required)

## Important production notes

This is a runnable academic prototype, not a production-ready campus identity or access-control system.

1. Browser notifications are best-effort; in-app notifications are stored in SQLite. For reliable push notifications while the browser is closed, add a service worker plus a push provider (for example, Web Push/FCM).
2. The scheduler runs inside the Flask process. For production, run a dedicated worker or scheduler process so it is not duplicated across multiple web workers.
3. Use HTTPS, secure cookies, strong secrets, CSRF protection for cookie-authenticated state-changing routes, rate limiting, and proper admin account management.
4. SQLite is suitable for a small single-instance demo. For concurrent multi-user deployment, use PostgreSQL and transactional/constraint-based overlap protection.
5. The sample hardware firmware needs adapting to your exact EM-18 output format, fingerprint sensor library, and NodeMCU UART pins. Keep the hardware API key private.
6. The web "Simulate check-in" and "Simulate exit" buttons are testing aids. Physical hardware events should use `/api/hardware/scan`.
7. Set the server timezone to `Asia/Kolkata`. Booking comparisons are performed using server time.

## Reset demo database

Stop Flask and delete `backend/instance/smart_library.db` (or the SQLite file created by your configured `DATABASE_URL`). Restart the backend to recreate demo seats and accounts.
