import { buildServer } from './server.js';

const app = buildServer();
const port = Number.parseInt(process.env.MOCK_B_PORT ?? '3001', 10);
const host = process.env.MOCK_B_HOST ?? '127.0.0.1';

await app.listen({ host, port });
