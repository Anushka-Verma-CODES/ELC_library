from app import (
    app,
    check_in_student,
    check_out_student,
    get_all_seat_status,
    get_registered_students,
    get_student_status,
)


def show_help():
    print(
        "ENTER <student_id>  - Student entry\n"
        "EXIT <student_id>   - Student exit\n"
        "STATUS <student_id> - Student status\n"
        "ALL                 - All seat statuses\n"
        "LIST STUDENTS       - List registered students and IDs\n"
        "HELP                - Show commands\n"
        "QUIT                - Exit terminal"
    )


def run_terminal():
    print(
        "========================================\n"
        "       SMART LIBRARY CONTROL SYSTEM\n"
        "========================================\n"
    )
    show_help()

    with app.app_context():
        while True:
            try:
                parts = input("LIBRARY > ").strip().split()
            except (EOFError, KeyboardInterrupt):
                print("\nExiting manual simulation.")
                break

            if not parts:
                continue

            command = parts[0].upper()
            if command == "QUIT" and len(parts) == 1:
                print("Exiting manual simulation.")
                break
            if command == "HELP" and len(parts) == 1:
                show_help()
                continue
            if command == "ALL" and len(parts) == 1:
                for seat in get_all_seat_status():
                    print(f"Seat {seat['seat_id']}: {seat['status']}")
                continue
            if command == "LIST" and len(parts) == 2 and parts[1].upper() == "STUDENTS":
                students = get_registered_students()
                if not students:
                    print("No students are registered.")
                    print("This backend has no student-registration endpoint; ask an administrator to provision a student account.")
                    continue
                print("Registered students:")
                for student in students:
                    print(f"{student['student_id']} - {student['name']}")
                continue
            if command == "STATUS" and len(parts) == 2:
                status = get_student_status(parts[1])
                if not status:
                    print("ERROR: Student not found. Use LIST STUDENTS to see registered IDs.")
                    continue
                print(f"Student: {status['student_id']} ({status['name']})")
                print(f"Status: {status['status']}")
                if status["seat_id"]:
                    print(f"Seat: {status['seat_id']}")
                continue
            if command in {"ENTER", "EXIT"} and len(parts) == 2:
                student_id = parts[1]
                if command == "ENTER":
                    booking, error = check_in_student(student_id, method="MANUAL")
                    if error:
                        suffix = " Use LIST STUDENTS to see registered IDs." if error == "Student not found." else ""
                        print(f"ERROR: {error}{suffix}")
                        continue
                    print("SUCCESS: Student checked in.")
                    print(f"Student: {student_id}")
                    print(f"Seat: {booking.seat_id}")
                    print("Status: OCCUPIED")
                    print("Method: MANUAL SIMULATION")
                else:
                    booking, error = check_out_student(student_id, method="MANUAL")
                    if error:
                        suffix = " Use LIST STUDENTS to see registered IDs." if error == "Student not found." else ""
                        print(f"ERROR: {error}{suffix}")
                        continue
                    print("SUCCESS: Student checked out.")
                    print(f"Seat {booking.seat_id} is now AVAILABLE.")
                continue

            print("Invalid command. Enter HELP to see the available commands.")


if __name__ == "__main__":
    run_terminal()
