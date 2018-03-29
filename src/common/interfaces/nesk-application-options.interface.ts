import { HttpsOptions } from './https-options.interface';
import { LoggerService } from '../services/logger.service';
import { NeskApplicationContextOptions } from './nesk-application-context-options.interface';
import { CorsOptions } from './external/cors-options.interface';

export interface NeskApplicationOptions extends NeskApplicationContextOptions {
  cors?: boolean | CorsOptions;
  bodyParser?: boolean;
  httpsOptions?: HttpsOptions;
  errorHandler?: boolean;
}
