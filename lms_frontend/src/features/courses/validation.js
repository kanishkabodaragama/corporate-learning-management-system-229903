const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

// PUBLIC_INTERFACE
/**
 * Validate course input for create/edit forms.
 *
 * @param {{
 *  title: string,
 *  description?: string,
 *  owner_id?: string,
 * }} input
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateCourseInput(input) {
  const errors = {};

  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Title is required.";
  else if (title.length < 3) errors.title = "Title must be at least 3 characters.";

  const ownerId = typeof input?.owner_id === "string" ? input.owner_id.trim() : "";
  if (ownerId && !isUuid(ownerId)) errors.owner_id = "Owner ID must be a valid UUID.";

  return { isValid: Object.keys(errors).length === 0, errors };
}
