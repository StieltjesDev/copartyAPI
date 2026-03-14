import { validationError } from "./errors.js";

export function requireFields(source, fields) {
  const missing = fields.filter((field) => {
    const value = source[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length) {
    throw validationError(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
  }
}

export function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw validationError(`${fieldName} precisa ser um inteiro positivo`);
  }

  return parsed;
}
