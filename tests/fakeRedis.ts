/**
 * The in-memory client the dev server uses, re-exported so the API tests and
 * `npm run dev` exercise exactly the same stand-in.
 */
export { MemoryRedis as FakeRedis } from '@/server/memoryRedis'
