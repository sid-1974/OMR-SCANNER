const successResponse = (res, statusCode = 200, message = 'Success', data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    ...data
  });
};

const errorResponse = (res, statusCode = 500, message = 'Server Error', stack = null) => {
  const response = {
    success: false,
    message,
  };
  if (stack) {
    response.stack = stack;
  }
  return res.status(statusCode).json(response);
};

module.exports = {
  successResponse,
  errorResponse
};
