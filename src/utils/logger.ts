import { consola } from 'consola';

export const logger = consola.create({
  formatOptions: {
    date: false,
  },
});

export const log = {
  info: logger.info.bind(logger),
  success: logger.success.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  box: logger.box.bind(logger),
  start: logger.start.bind(logger),
};
