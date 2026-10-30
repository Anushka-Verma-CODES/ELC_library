import os
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

_test_database = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = f"sqlite:///{_test_database.name}/test-library.db"

import app as backend
from manual_commands import run_terminal


class BookingServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = backend.app
        cls.app.config["TESTING"] = True
        cls.now = backend.local_now()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            backend.db.session.remove()
            backend.db.engine.dispose()
        _test_database.cleanup()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        backend.db.drop_all()
        backend.db.create_all()
        backend.db.session.add(backend.Seat(id="A01"))
        backend.db.session.add(backend.User(
            student_id="TEST001",
            name="Test Student",
            email="test001@example.invalid",
            password_hash="test-only",
            rfid_uid="TEST-RFID",
            fingerprint_id="999",
        ))
        backend.db.session.commit()
        self.now = backend.local_now()
        self.clock = patch.object(backend, "local_now", return_value=self.now)
        self.clock.start()

    def tearDown(self):
        self.clock.stop()
        backend.db.session.remove()
        self.context.pop()

    def add_booking(self, start_offset_minutes=-5):
        booking = backend.Booking(
            student_id="TEST001",
            seat_id="A01",
            start_at=self.now + timedelta(minutes=start_offset_minutes),
            end_at=self.now + timedelta(hours=1),
            status="RESERVED",
        )
        backend.db.session.add(booking)
        backend.db.session.commit()
        return booking

    def test_manual_checkin_and_checkout_update_seat_and_method(self):
        booking = self.add_booking()

        checked_in, error = backend.check_in_student("TEST001", "MANUAL")
        self.assertIsNone(error)
        self.assertEqual(checked_in.id, booking.id)
        self.assertEqual(checked_in.status, "OCCUPIED")
        self.assertIsNotNone(checked_in.checked_in_at)
        self.assertEqual(backend.get_all_seat_status()[0]["status"], "OCCUPIED")
        self.assertEqual(backend.AttendanceEvent.query.one().method, "MANUAL")

        client = self.app.test_client()
        with client.session_transaction() as session:
            session["student_id"] = "TEST001"
        self.assertEqual(client.get("/api/seats").json["seats"][0]["status"], "OCCUPIED")

        checked_out, error = backend.check_out_student("TEST001", "MANUAL")
        self.assertIsNone(error)
        self.assertEqual(checked_out.status, "COMPLETED")
        self.assertIsNotNone(checked_out.checked_out_at)
        self.assertEqual(backend.get_all_seat_status()[0]["status"], "AVAILABLE")
        self.assertEqual(client.get("/api/seats").json["seats"][0]["status"], "AVAILABLE")

    def test_terminal_entry_status_and_exit_commands(self):
        self.add_booking()
        output = StringIO()
        commands = ["ENTER TEST001", "STATUS TEST001", "EXIT TEST001", "QUIT"]

        with patch("builtins.input", side_effect=commands), redirect_stdout(output):
            run_terminal()

        self.assertIn("SUCCESS: Student checked in.", output.getvalue())
        self.assertIn("Status: OCCUPIED", output.getvalue())
        self.assertIn("SUCCESS: Student checked out.", output.getvalue())
        self.assertIn("Seat A01 is now AVAILABLE.", output.getvalue())

    def test_terminal_lists_registered_student_ids(self):
        output = StringIO()

        with patch("builtins.input", side_effect=["LIST STUDENTS", "QUIT"]), redirect_stdout(output):
            run_terminal()

        self.assertIn("TEST001 - Test Student", output.getvalue())
        self.assertNotIn("admin -", output.getvalue())

    def test_terminal_suggests_listing_ids_for_unknown_student(self):
        output = StringIO()

        with patch("builtins.input", side_effect=["ENTER STU001", "QUIT"]), redirect_stdout(output):
            run_terminal()

        self.assertIn("Student not found.", output.getvalue())
        self.assertIn("Use LIST STUDENTS to see registered IDs.", output.getvalue())
        self.assertIsNone(backend.User.query.filter_by(student_id="STU001").first())

    def test_expired_booking_is_cancelled_and_cannot_check_in(self):
        booking = self.add_booking(start_offset_minutes=-16)

        checked_in, error = backend.check_in_student("TEST001", "MANUAL")

        self.assertIsNone(checked_in)
        self.assertIsNotNone(error)
        self.assertEqual(backend.db.session.get(backend.Booking, booking.id).status, "CANCELLED")
        self.assertEqual(backend.get_all_seat_status()[0]["status"], "AVAILABLE")

    def test_checkin_is_allowed_at_exact_grace_period_boundary(self):
        self.add_booking(start_offset_minutes=-15)

        checked_in, error = backend.check_in_student("TEST001", "MANUAL")

        self.assertIsNone(error)
        self.assertIsNotNone(checked_in)
        self.assertEqual(checked_in.status, "OCCUPIED")

    def test_duplicate_checkin_is_rejected(self):
        self.add_booking()
        first, first_error = backend.check_in_student("TEST001", "MANUAL")
        second, second_error = backend.check_in_student("TEST001", "MANUAL")

        self.assertIsNone(first_error)
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(second_error, "Student is already checked in.")
        self.assertEqual(backend.AttendanceEvent.query.count(), 1)

    def test_invalid_student_is_rejected(self):
        booking, error = backend.check_in_student("INVALID", "MANUAL")

        self.assertIsNone(booking)
        self.assertEqual(error, "Student not found.")

    def test_checkout_without_checkin_does_not_release_seat(self):
        booking = self.add_booking()

        checked_out, error = backend.check_out_student("TEST001", "MANUAL")

        self.assertIsNone(checked_out)
        self.assertIsNotNone(error)
        self.assertEqual(backend.db.session.get(backend.Booking, booking.id).status, "RESERVED")
        self.assertEqual(backend.get_all_seat_status()[0]["status"], "RESERVED")

    def test_hardware_scan_uses_shared_booking_services(self):
        self.add_booking()
        client = self.app.test_client()

        with patch.dict(os.environ, {"HARDWARE_API_KEY": "test-key"}):
            entry = client.post(
                "/api/hardware/scan",
                headers={"X-Hardware-Key": "test-key"},
                json={"method": "RFID", "credential": "TEST-RFID"},
            )
            exit_event = client.post(
                "/api/hardware/scan",
                headers={"X-Hardware-Key": "test-key"},
                json={"method": "RFID", "credential": "TEST-RFID"},
            )

        self.assertEqual(entry.status_code, 200)
        self.assertEqual(entry.json["action"], "ENTRY")
        self.assertEqual(exit_event.status_code, 200)
        self.assertEqual(exit_event.json["action"], "EXIT")
        self.assertEqual(
            [event.method for event in backend.AttendanceEvent.query.order_by(backend.AttendanceEvent.id)],
            ["RFID", "RFID"],
        )


if __name__ == "__main__":
    unittest.main()
