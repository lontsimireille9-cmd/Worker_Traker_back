import 'dotenv/config';import {reconcileAll} from '../src/services/checklist.service.js';await reconcileAll();console.log('Activités réconciliées.');process.exit(0);
