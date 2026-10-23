/**
 * Public type surface for the Remote boundary. The generator requires every
 * type crossing a Remote endpoint to be reachable from a non-root type subpath,
 * so wire types are re-exported here as `@bilibili/dsh-toy/types`.
 */
export type {
  AccountView,
  ActionResult,
  HistoryClearTicket,
  HistoryRecord,
  PublishInput,
  PublishPreparation,
  SubmitResult,
  ToyChange,
  ToyDynStats,
  ToyError,
  ToyFinding,
  ToyListPage,
  ToyPrecheck,
  ToyStats,
  ToyStatsDay,
  ToySummary,
  ToyTarget,
  ToyUser,
} from './shared/types.ts'
