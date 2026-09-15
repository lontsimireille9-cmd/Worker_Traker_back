import 'dotenv/config';import {generateAll} from '../src/services/checklist.service.js';await generateAll();console.log('Daily checklists générées.');process.exit(0);
