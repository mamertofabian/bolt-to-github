import { BackgroundService } from './BackgroundService';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('BackgroundIndex');
logger.info('🎯 Background script entry point loaded');

new BackgroundService();
