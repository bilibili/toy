/**
 * The Host-side service the browser page talks to.
 *
 * Every method is a Typert Remote endpoint (`@Remote`) on namespace
 * `toyPublisher`; the browser half mounts the generated `./remote` artifact and
 * calls `ctx.remote.toyPublisher.<method>(...)`. All publish-safety rules live
 * in the shared Host service (`./service.js`), so the page and the model tools
 * cannot drift apart.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import type { ToyService } from './service-api.ts'
import type {
  AccountView,
  ActionResult,
  CliUpdateView,
  CliUpgradeResult,
  HistoryClearTicket,
  HistoryRecord,
  PublishInput,
  PublishPreparation,
  SkillActionResult,
  SkillStatus,
  SubmitResult,
  ToyListPage,
  ToyPrecheck,
  ToyStats,
} from '../shared/types.ts'

/** Owner id the Web page uses for its prepared publish intents. */
const WEB_OWNER = 'web-ui'

/**
 * Remote-only service exposing the Toy CLI to the browser page.
 *
 * Mutating endpoints never prompt: the page owns the human confirmation
 * (preview link + explicit submit), then `submitPublish` runs the prepared argv
 * with `--yes`. The Host still refuses stale, foreign or package-changed
 * intents.
 *
 * @typert service toyPublisher
 */
export class ToyController extends TypertRemoteService {
  private readonly service: ToyService

  constructor(ctx: Context, service: ToyService) {
    super(ctx, 'toyPublisher', { namespace: 'toyPublisher' })
    this.service = service
  }

  /** Account state: logged-in user, resolved binary, CLI version. */
  @Remote('account')
  async account(): Promise<AccountView> {
    return await this.service.account()
  }

  /** `toy upgrade --check`; the page shows the result and asks before upgrading. */
  @Remote('cliUpdateCheck')
  async cliUpdateCheck(): Promise<CliUpdateView> {
    return await this.service.cliUpdateCheck()
  }

  /** Replace the host's toy binary; the page has already confirmed. */
  @Remote('upgradeCli')
  async upgradeCli(): Promise<CliUpgradeResult> {
    return await this.service.upgradeCli()
  }

  /** Start the Host-side browser OAuth flow; resolves when the CLI returns. */
  @Remote('login')
  async login(noOpen: boolean): Promise<AccountView> {
    return await this.service.login(noOpen)
  }

  /** Clear the local session. */
  @Remote('logout')
  async logout(): Promise<AccountView> {
    return await this.service.logout()
  }

  /** One page of the creator's Toys. */
  @Remote('listToys')
  async listToys(page: number, size: number): Promise<ToyListPage> {
    return await this.service.listToys(page, size)
  }

  /**
   * One Toy's visit stats.
   * @param id - Toy id.
   * @param days - last N days ending yesterday; 0 means use start/end.
   * @param start - explicit window start `YYYY-MM-DD`.
   * @param end - explicit window end `YYYY-MM-DD`.
   */
  @Remote('stats')
  async stats(id: number, days: number, start: string, end: string): Promise<ToyStats> {
    return await this.service.stats(id, {
      ...(days > 0 ? { days } : {}),
      ...(start !== '' && end !== '' ? { start, end } : {}),
    })
  }

  /** Local publish/update history; an empty path means all records. */
  @Remote('history')
  async history(path: string): Promise<readonly HistoryRecord[]> {
    return await this.service.history(path)
  }

  /** Issue a one-shot ticket after the page's typed confirmation. */
  @Remote('prepareHistoryClear')
  async prepareHistoryClear(): Promise<HistoryClearTicket> {
    return await this.service.prepareHistoryClear(WEB_OWNER)
  }

  /** Delete all local publish records, consuming the ticket. */
  @Remote('clearHistory')
  async clearHistory(token: string): Promise<ActionResult> {
    return await this.service.clearHistory(token, WEB_OWNER)
  }

  /** Bundled vs managed skill state (versions, paths, update availability). */
  @Remote('skillStatus')
  async skillStatus(): Promise<SkillStatus> {
    return await this.service.skillStatus()
  }

  /**
   * Install or update the managed skill with the fixed `npx skills` command.
   * The page asks the human first; the endpoint takes no arguments, so the
   * browser cannot inject a repository, agent, or flag.
   */
  @Remote('installSkill')
  async installSkill(): Promise<SkillActionResult> {
    return await this.service.installSkill()
  }

  /** Host paths from the local history, for the path suggestions. */
  @Remote('historyPaths')
  async historyPaths(): Promise<readonly string[]> {
    return await this.service.historyPaths()
  }

  /** Local package precheck; never uploads. */
  @Remote('precheck')
  async precheck(path: string, poster: string, icon: string, slug: string): Promise<ToyPrecheck> {
    return await this.service.precheck({
      path,
      ...(poster === '' ? {} : { poster }),
      ...(icon === '' ? {} : { icon }),
      ...(slug === '' ? {} : { slug }),
    })
  }

  /** Upload once for a preview, or plan a metadata-only update. */
  @Remote('preparePublish')
  async preparePublish(input: PublishInput): Promise<PublishPreparation> {
    return await this.service.preparePublish(input, WEB_OWNER)
  }

  /** Submit a prepared publish with `--yes`; the page has already confirmed. */
  @Remote('submitPublish')
  async submitPublish(pendingId: string): Promise<SubmitResult> {
    return await this.service.submitPublish(pendingId, WEB_OWNER) as SubmitResult
  }

  /** Drop a prepared publish the page abandoned. */
  @Remote('cancelPending')
  async cancelPending(pendingId: string): Promise<ActionResult> {
    return await this.service.cancelPending(pendingId, WEB_OWNER)
  }
}
