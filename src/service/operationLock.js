import { invalidStateError } from "../lib/errors.js";

const activeLocks = new Set();

export async function withOperationalLock(lockKey, operationName, callback) {
  if (activeLocks.has(lockKey)) {
    throw invalidStateError(`${operationName} ja esta em execucao`);
  }

  activeLocks.add(lockKey);
  try {
    return await callback();
  } finally {
    activeLocks.delete(lockKey);
  }
}
