const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function isFiniteDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

// PUBLIC_INTERFACE
/**
 * Validate session input for create/edit forms.
 *
 * @param {{
 *  course_id: string,
 *  title: string,
 *  starts_at_local: string,  // datetime-local string
 *  ends_at_local?: string,   // datetime-local string
 *  capacity?: string | number,
 * }} input
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateSessionInput(input) {
  const errors = {};

  const courseId = typeof input?.course_id === "string" ? input.course_id.trim() : "";
  if (!courseId) errors.course_id = "Course is required.";
  else if (!isUuid(courseId)) errors.course_id = "Course must be a valid UUID.";

  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Title is required.";
  else if (title.length < 3) errors.title = "Title must be at least 3 characters.";

  const startsLocal = typeof input?.starts_at_local === "string" ? input.starts_at_local.trim() : "";
  if (!startsLocal) {
    errors.starts_at_local = "Start date/time is required.";
  } else {
    const sd = new Date(startsLocal);
    if (!isFiniteDate(sd)) errors.starts_at_local = "Start date/time is invalid.";
  }

  const endsLocal = typeof input?.ends_at_local === "string" ? input.ends_at_local.trim() : "";
  if (endsLocal) {
    const ed = new Date(endsLocal);
    const sd = new Date(startsLocal);
    if (!isFiniteDate(ed)) errors.ends_at_local = "End date/time is invalid.";
    else if (isFiniteDate(sd) && ed.getTime() <= sd.getTime()) {
      errors.ends_at_local = "End must be after start.";
    }
  }

  if (input?.capacity !== undefined && input?.capacity !== null && String(input.capacity).trim() !== "") {
    const parsed = Number(input.capacity);
    if (!Number.isFinite(parsed) || parsed < 0) errors.capacity = "Capacity must be a non-negative number.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
