import os
from datetime import datetime, timedelta
from functools import wraps
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_apscheduler import APScheduler
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()
db = SQLAlchemy()
scheduler = APScheduler()

TZ_NAME = os.getenv("APP_TIMEZONE", "Asia/Kolkata")
TZ = ZoneInfo(TZ_NAME)
GRACE_MINUTES = 15
RENEWAL_NOTICE_MINUTES = 15
SEAT_IDS = [f"A{i:02d}" for i in range(1, 11)]

def local_now():
    return datetime.now(TZ).replace(second=0, microsecond=0)

def parse_local(value):
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)

def aware(dt):
    # SQLite stores timezone-aware DateTime values as naive local wall time.
    # Reattach the configured application timezone when reading them back.
    return dt.replace(tzinfo=TZ) if dt is not None and dt.tzinfo is None else dt

def iso(dt):
    return aware(dt).astimezone(TZ).isoformat(timespec="minutes")

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(40), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="student")
    rfid_uid = db.Column(db.String(80), unique=True)
    fingerprint_id = db.Column(db.String(40), unique=True)

class Seat(db.Model):
    id = db.Column(db.String(10), primary_key=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

class Booking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(40), db.ForeignKey("user.student_id"), nullable=False)
    seat_id = db.Column(db.String(10), db.ForeignKey("seat.id"), nullable=False)
    start_at = db.Column(db.DateTime(timezone=True), nullable=False)
    end_at = db.Column(db.DateTime(timezone=True), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="RESERVED")
    checked_in_at = db.Column(db.DateTime(timezone=True))
    checked_out_at = db.Column(db.DateTime(timezone=True))
    renewal_notice_sent = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=local_now)

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(40), db.ForeignKey("user.student_id"), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    kind = db.Column(db.String(30), nullable=False, default="INFO")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=local_now)
    is_read = db.Column(db.Boolean, nullable=False, default=False)

class AttendanceEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(40), nullable=False)
    booking_id = db.Column(db.Integer)
    event = db.Column(db.String(20), nullable=False)
    method = db.Column(db.String(20), nullable=False)
    occurred_at = db.Column(db.DateTime(timezone=True), nullable=False, default=local_now)
    result = db.Column(db.String(30), nullable=False)

def notify(student_id, title, message, kind="INFO"):
    db.session.add(Notification(student_id=student_id, title=title, message=message, kind=kind))

def booking_dict(b):
    return {
        "id": b.id, "student_id": b.student_id, "seat_id": b.seat_id,
        "start_at": iso(b.start_at), "end_at": iso(b.end_at), "status": b.status,
        "checked_in_at": iso(b.checked_in_at) if b.checked_in_at else None,
        "checked_out_at": iso(b.checked_out_at) if b.checked_out_at else None,
    }

def user_dict(u):
    return {"student_id": u.student_id, "name": u.name, "email": u.email, "role": u.role}

def api_error(message, status=400):
    return jsonify(error=message), status

def current_user():
    uid = session.get("student_id")
    return User.query.filter_by(student_id=uid).first() if uid else None

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return api_error("Please log in first.", 401)
        return fn(*args, **kwargs)
    return wrapper

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u:
            return api_error("Please log in first.", 401)
        if u.role != "admin":
            return api_error("Administrator access required.", 403)
        return fn(*args, **kwargs)
    return wrapper

def active_booking_for_student(student_id):
    return Booking.query.filter(
        Booking.student_id == student_id,
        Booking.status.in_(["RESERVED", "OCCUPIED", "OVERDUE"])
    ).order_by(Booking.start_at.asc()).first()

def seat_conflict(seat_id, start, end, exclude_id=None):
    q = Booking.query.filter(
        Booking.seat_id == seat_id,
        Booking.status.in_(["RESERVED", "OCCUPIED", "OVERDUE"]),
        Booking.start_at < end,
        Booking.end_at > start
    )
    if exclude_id:
        q = q.filter(Booking.id != exclude_id)
    return q.first()

def run_booking_jobs():
    now = local_now()
    changed = False
    # A reservation expires at the exact end of its 15-minute check-in window.
    for b in Booking.query.filter_by(status="RESERVED").all():
        if now > aware(b.start_at) + timedelta(minutes=GRACE_MINUTES):
            b.status = "CANCELLED"
            notify(b.student_id, "Reservation cancelled", f"Your {b.seat_id} reservation was cancelled because you did not check in within 15 minutes.", "CANCELLED")
            changed = True
    # Remind checked-in students 15 minutes before their current end time.
    for b in Booking.query.filter(Booking.status == "OCCUPIED", Booking.renewal_notice_sent.is_(False)).all():
        if aware(b.end_at) - timedelta(minutes=RENEWAL_NOTICE_MINUTES) <= now < aware(b.end_at):
            notify(b.student_id, "Booking ending soon", f"Your {b.seat_id} booking ends at {b.end_at.strftime('%I:%M %p')}. Renew if you want to continue, or scan your ID/fingerprint when leaving.", "RENEWAL")
            b.renewal_notice_sent = True
            changed = True
        if now >= aware(b.end_at):
            b.status = "OVERDUE"
            notify(b.student_id, "Booking time ended", f"Your booking for {b.seat_id} has ended. Please scan your ID/fingerprint at the exit. The seat remains occupied until exit is verified.", "OVERDUE")
            changed = True
    if changed:
        db.session.commit()

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-only-change-me")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///smart_library.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SECURE"] = False  # Set True behind HTTPS in production.
    db.init_app(app)
    CORS(app, supports_credentials=True, origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")])

    with app.app_context():
        db.create_all()
        for sid in SEAT_IDS:
            if not db.session.get(Seat, sid):
                db.session.add(Seat(id=sid))
        if not User.query.filter_by(student_id="admin").first():
            db.session.add(User(student_id="admin", name="Library Admin", email="admin@library.local",
                                password_hash=generate_password_hash("Admin@123"), role="admin"))
        if not User.query.filter_by(student_id="102").first():
            db.session.add(User(student_id="102", name="Aarav Sharma", email="102@student.local",
                                password_hash=generate_password_hash("Student@123"), role="student",
                                rfid_uid="RFID102", fingerprint_id="1"))
        if not User.query.filter_by(student_id="103").first():
            db.session.add(User(student_id="103", name="Ananya Verma", email="103@student.local",
                                password_hash=generate_password_hash("Student@123"), role="student",
                                rfid_uid="RFID103", fingerprint_id="2"))
        db.session.commit()

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", timezone=TZ_NAME, server_time=iso(local_now()))

    @app.post("/api/auth/login")
    def login():
        data = request.get_json(silent=True) or {}
        identifier = (data.get("student_id") or "").strip()
        password = data.get("password") or ""
        user = User.query.filter((User.student_id == identifier) | (User.email == identifier)).first()
        if not user or not check_password_hash(user.password_hash, password):
            return api_error("Invalid ID/email or password.", 401)
        session["student_id"] = user.student_id
        return jsonify(user=user_dict(user))

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.get("/api/auth/me")
    def me():
        u = current_user()
        return jsonify(user=user_dict(u) if u else None)

    @app.get("/api/seats")
    @login_required
    def seats():
        start_s, end_s = request.args.get("start"), request.args.get("end")
        start = parse_local(start_s) if start_s else local_now()
        end = parse_local(end_s) if end_s else start + timedelta(minutes=1)
        result = []
        for seat in Seat.query.order_by(Seat.id).all():
            conflict = seat_conflict(seat.id, start, end)
            current = Booking.query.filter(
                Booking.seat_id == seat.id,
                Booking.status.in_(["OCCUPIED", "OVERDUE"]),
                Booking.start_at <= local_now()
            ).first()
            result.append({
                "seat_id": seat.id, "is_active": seat.is_active,
                "status": "UNAVAILABLE" if not seat.is_active else
                          ("OCCUPIED" if current else ("RESERVED" if conflict else "AVAILABLE")),
                "booking": booking_dict(conflict) if conflict else None
            })
        return jsonify(seats=result, server_time=iso(local_now()))

    @app.get("/api/bookings")
    @login_required
    def my_bookings():
        u = current_user()
        rows = Booking.query.filter_by(student_id=u.student_id).order_by(Booking.start_at.desc()).limit(100).all()
        return jsonify(bookings=[booking_dict(b) for b in rows])

    @app.post("/api/bookings")
    @login_required
    def create_booking():
        u = current_user()
        data = request.get_json(silent=True) or {}
        seat_id = data.get("seat_id")
        if seat_id not in SEAT_IDS:
            return api_error("Select a valid seat.")
        seat = db.session.get(Seat, seat_id)
        if not seat or not seat.is_active:
            return api_error("This seat is currently unavailable.")
        try:
            start, end = parse_local(data["start_at"]), parse_local(data["end_at"])
        except Exception:
            return api_error("Choose valid start and end times.")
        now = local_now()
        if start < now + timedelta(minutes=1) or end <= start:
            return api_error("Choose a future time range.")
        if end - start > timedelta(hours=4):
            return api_error("A booking can be up to 4 hours in this prototype.")
        if Booking.query.filter(
            Booking.student_id == u.student_id,
            Booking.status.in_(["RESERVED", "OCCUPIED", "OVERDUE"]),
            Booking.start_at < end, Booking.end_at > start
        ).first():
            return api_error("You already have an overlapping booking.", 409)
        if seat_conflict(seat_id, start, end):
            return api_error("This seat is already reserved for an overlapping time.", 409)
        b = Booking(student_id=u.student_id, seat_id=seat_id, start_at=start, end_at=end, status="RESERVED")
        db.session.add(b)
        notify(u.student_id, "Booking confirmed", f"Seat {seat_id} is reserved from {start.strftime('%I:%M %p')} to {end.strftime('%I:%M %p')}. Check in within 15 minutes after the start time.", "BOOKED")
        db.session.commit()
        return jsonify(booking=booking_dict(b)), 201

    @app.post("/api/bookings/<int:booking_id>/cancel")
    @login_required
    def cancel_booking(booking_id):
        u = current_user()
        b = db.session.get(Booking, booking_id)
        if not b or (b.student_id != u.student_id and u.role != "admin"):
            return api_error("Booking not found.", 404)
        if b.status != "RESERVED" or local_now() >= aware(b.start_at):
            return api_error("Only a future, not-yet-started reservation can be cancelled here.", 409)
        b.status = "CANCELLED"
        notify(b.student_id, "Booking cancelled", f"Your reservation for {b.seat_id} was cancelled.", "CANCELLED")
        db.session.commit()
        return jsonify(ok=True)

    def perform_checkin(user, method):
        now = local_now()
        b = Booking.query.filter_by(student_id=user.student_id, status="RESERVED").order_by(Booking.start_at).first()
        if not b:
            return None, "No active reservation is available for check-in."
        if now < aware(b.start_at) or now > aware(b.start_at) + timedelta(minutes=GRACE_MINUTES):
            return None, "Check-in is allowed from the booking start until 15 minutes later."
        other_occupant = Booking.query.filter(
            Booking.seat_id == b.seat_id,
            Booking.student_id != user.student_id,
            Booking.status.in_(["OCCUPIED", "OVERDUE"])
        ).first()
        if other_occupant:
            return None, "This seat is still physically occupied. Please contact the library desk."
        b.status = "OCCUPIED"
        b.checked_in_at = now
        db.session.add(AttendanceEvent(student_id=user.student_id, booking_id=b.id, event="ENTRY", method=method, result="SUCCESS"))
        notify(user.student_id, "Check-in successful", f"You are checked in at seat {b.seat_id}.", "ENTRY")
        db.session.commit()
        return b, None

    def perform_checkout(user, method):
        b = Booking.query.filter_by(student_id=user.student_id, status="OCCUPIED").order_by(Booking.end_at).first()
        if not b:
            b = Booking.query.filter_by(student_id=user.student_id, status="OVERDUE").order_by(Booking.end_at).first()
        if not b:
            return None, "No occupied booking was found for this student."
        b.status = "COMPLETED"
        b.checked_out_at = local_now()
        db.session.add(AttendanceEvent(student_id=user.student_id, booking_id=b.id, event="EXIT", method=method, result="SUCCESS"))
        notify(user.student_id, "Exit recorded", f"Seat {b.seat_id} is now available.", "EXIT")
        db.session.commit()
        return b, None

    @app.post("/api/checkin")
    @login_required
    def checkin():
        u = current_user()
        b, error = perform_checkin(u, "WEB_DEMO")
        if error: return api_error(error, 409)
        return jsonify(message="Check-in successful.", booking=booking_dict(b))

    @app.post("/api/checkout")
    @login_required
    def checkout():
        u = current_user()
        b, error = perform_checkout(u, "WEB_DEMO")
        if error: return api_error(error, 409)
        return jsonify(message="Exit recorded. Seat released.", booking=booking_dict(b))

    @app.post("/api/bookings/<int:booking_id>/renew")
    @login_required
    def renew(booking_id):
        u = current_user()
        b = db.session.get(Booking, booking_id)
        if not b or b.student_id != u.student_id:
            return api_error("Booking not found.", 404)
        if b.status not in ["OCCUPIED", "OVERDUE"]:
            return api_error("Only a checked-in booking can be renewed.", 409)
        if b.status == "OVERDUE":
            return api_error("The booking has already ended. Please contact the library administrator.", 409)
        data = request.get_json(silent=True) or {}
        try:
            new_end = parse_local(data["new_end_at"])
        except Exception:
            return api_error("Choose a valid new end time.")
        old_end = aware(b.end_at)
        if new_end <= old_end or new_end - old_end > timedelta(hours=4):
            return api_error("Choose an extension after the current end time, up to 4 additional hours.")
        if seat_conflict(b.seat_id, old_end, new_end, exclude_id=b.id):
            return api_error("The next time slot is already booked.")
        b.end_at = new_end
        b.status = "OCCUPIED"
        b.renewal_notice_sent = False
        notify(u.student_id, "Booking extended", f"Your booking for {b.seat_id} is extended until {new_end.strftime('%I:%M %p')}. You remain checked in.", "RENEWED")
        db.session.commit()
        return jsonify(message="Booking extended. You remain occupied; no new scan is needed.", booking=booking_dict(b))

    @app.get("/api/notifications")
    @login_required
    def notifications():
        u = current_user()
        rows = Notification.query.filter_by(student_id=u.student_id).order_by(Notification.created_at.desc()).limit(50).all()
        return jsonify(notifications=[{"id":n.id,"title":n.title,"message":n.message,"kind":n.kind,
            "created_at":iso(n.created_at),"is_read":n.is_read} for n in rows])

    @app.post("/api/notifications/<int:nid>/read")
    @login_required
    def mark_read(nid):
        u = current_user()
        n = Notification.query.filter_by(id=nid, student_id=u.student_id).first()
        if not n: return api_error("Notification not found.", 404)
        n.is_read = True
        db.session.commit()
        return jsonify(ok=True)

    @app.get("/api/admin/overview")
    @admin_required
    def admin_overview():
        now = local_now()
        active = Booking.query.filter(Booking.status.in_(["OCCUPIED", "OVERDUE"])).all()
        reserved = Booking.query.filter_by(status="RESERVED").all()
        return jsonify(total_seats=Seat.query.filter_by(is_active=True).count(),
            occupied=len(active), reserved=len(reserved),
            available=max(0, Seat.query.filter_by(is_active=True).count()-len(active)-len(reserved)),
            students=User.query.filter_by(role="student").count(),
            overdue=sum(1 for b in active if b.status=="OVERDUE"))

    @app.get("/api/admin/bookings")
    @admin_required
    def admin_bookings():
        rows = Booking.query.order_by(Booking.created_at.desc()).limit(200).all()
        return jsonify(bookings=[booking_dict(b) for b in rows])

    @app.get("/api/admin/attendance")
    @admin_required
    def admin_attendance():
        rows = AttendanceEvent.query.order_by(AttendanceEvent.occurred_at.desc()).limit(200).all()
        return jsonify(events=[{"id":e.id,"student_id":e.student_id,"booking_id":e.booking_id,
            "event":e.event,"method":e.method,"result":e.result,"occurred_at":iso(e.occurred_at)} for e in rows])

    @app.get("/api/admin/students")
    @admin_required
    def admin_students():
        return jsonify(students=[user_dict(u) for u in User.query.filter_by(role="student").all()])

    @app.post("/api/admin/seats/<seat_id>/toggle")
    @admin_required
    def toggle_seat(seat_id):
        seat = db.session.get(Seat, seat_id)
        if not seat: return api_error("Seat not found.", 404)
        seat.is_active = not seat.is_active
        db.session.commit()
        return jsonify(seat_id=seat.id, is_active=seat.is_active)

    # Hardware event: NodeMCU sends RFID UID or fingerprint template ID.
    @app.post("/api/hardware/scan")
    def hardware_scan():
        expected = os.getenv("HARDWARE_API_KEY", "replace-this-hardware-key")
        supplied = request.headers.get("X-Hardware-Key", "")
        if not expected or supplied != expected:
            return api_error("Unauthorized hardware device.", 401)
        data = request.get_json(silent=True) or {}
        method = (data.get("method") or "").upper()
        credential = str(data.get("credential", "")).strip()
        if method not in ["RFID", "FINGERPRINT"] or not credential:
            return api_error("Provide method RFID/FINGERPRINT and credential.")
        user = User.query.filter_by(rfid_uid=credential).first() if method == "RFID" else User.query.filter_by(fingerprint_id=credential).first()
        if not user:
            return api_error("Credential is not registered.", 404)
        occupied = Booking.query.filter_by(student_id=user.student_id, status="OCCUPIED").first()
        overdue = Booking.query.filter_by(student_id=user.student_id, status="OVERDUE").first()
        if occupied or overdue:
            b, error = perform_checkout(user, method)
            action = "EXIT"
        else:
            b, error = perform_checkin(user, method)
            action = "ENTRY"
        if error:
            db.session.add(AttendanceEvent(student_id=user.student_id, event="SCAN", method=method, result="REJECTED"))
            db.session.commit()
            return api_error(error, 409)
        return jsonify(ok=True, student_id=user.student_id, name=user.name, action=action,
                       seat_id=b.seat_id, status=b.status, booking=booking_dict(b))

    @app.get("/api/admin/config")
    @admin_required
    def admin_config():
        return jsonify(seats=SEAT_IDS, grace_minutes=GRACE_MINUTES,
                       renewal_notice_minutes=RENEWAL_NOTICE_MINUTES, timezone=TZ_NAME)

    return app

app = create_app()

def scheduled_booking_rules():
    with app.app_context():
        run_booking_jobs()

if __name__ == "__main__":
    scheduler.init_app(app)
    scheduler.add_job(id="booking_rules", func=scheduled_booking_rules,
                      trigger="interval", seconds=15, replace_existing=True)
    scheduler.start()
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
