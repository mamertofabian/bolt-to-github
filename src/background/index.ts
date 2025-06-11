import { BackgroundService } from './BackgroundService';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('BackgroundIndex');
logger.info('🎯 Background script entry point loaded');

try {
  new BackgroundService();
} catch (error) {
  logger.error('Failed to initialize BackgroundService:', error);
}
