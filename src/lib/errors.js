export function appError(status, code, message, details = null) {
  return Object.assign(new Error(message), {
    status,
    code,
    details,
  });
}

export function validationError(message, details = null) {
  return appError(400, "VALIDATION_ERROR", message, details);
}

export function notFoundError(message) {
  return appError(404, "NOT_FOUND", message);
}

export function forbiddenError(message) {
  return appError(403, "FORBIDDEN", message);
}

export function invalidStateError(message) {
  return appError(409, "INVALID_STATE", message);
}

export function configurationError(message, details = null) {
  return appError(500, "CONFIGURATION_ERROR", message, details);
}
