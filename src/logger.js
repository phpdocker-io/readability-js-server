function timestamp() {
  return new Date().toISOString();
}

function write(method, message, error) {
  const prefix = `[${timestamp()}]`;

  if (error) {
    console[method](`${prefix} ${message}`, error);
    return;
  }

  console[method](`${prefix} ${message}`);
}

function createLogger() {
  return {
    info(message) {
      write("log", message);
    },
    error(message, error) {
      write("error", message, error);
    },
  };
}

module.exports = {
  createLogger,
};
