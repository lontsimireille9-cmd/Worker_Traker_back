export function sendSuccess(res, statusCode, message, data = null) {
  const payload = { success: true, message };

  if (data !== null) {
    payload.data = data;
  }

  return res.status(statusCode).json(payload);
}

export function sendError(res, statusCode, message, data = null) {
  const payload = { success: false, message, error: message };

  if (data !== null) {
    payload.data = data;
  }

  return res.status(statusCode).json(payload);
}
