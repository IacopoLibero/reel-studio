import type { Page } from 'playwright';
import { checkCaption } from './caption.js';
import { captionStartOf, wallToIso } from './calendar.js';
import { SchedulerError, STEPS, type JobContext } from './types.js';

export interface FlowInput {
  url: string;
  videoPath: string;
  coverPath: string;
  caption: string;
  /** Rome wall time "YYYY-MM-DDTHH:mm". */
  slot: string;
  /** Called once Instagram confirmed the scheduling (before verify), to persist state. */
  onScheduled?: () => Promise<void>;
  /** How long to wait for the Crop step after the upload (default 90 s); tests shorten it. */
  cropTimeoutMs?: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface SlotParts {
  year: number; month: number; day: number; hour24: number; minute: number;
  hour12: string; minuteStr: string; ampm: 'A' | 'P'; dateLabel: string; timeLabel: string;
}

export function slotParts(slot: string): SlotParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(slot);
  if (!m) throw new SchedulerError('bad_input', `Bad slot ${slot}`);
  const [year, month, day, hour24, minute] = m.slice(1).map(Number);
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const dow = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const minuteStr = String(minute).padStart(2, '0');
  const ampm = hour24 >= 12 ? 'P' : 'A';
  return {
    year, month, day, hour24, minute, hour12: String(h12).padStart(2, '0'), minuteStr, ampm,
    dateLabel: `${dow}, ${SHORT_MONTHS[month - 1]} ${day}, ${year}`,
    timeLabel: `${h12}:${minuteStr} ${ampm}M`,
  };
}

function check(ctx: JobContext) {
  if (ctx.signal.aborted) throw new SchedulerError('cancelled', 'Job cancelled');
}

async function readSpin(page: Page, name: string): Promise<string> {
  return page.getByRole('spinbutton', { name }).first().evaluate((el) => {
    const e = el as HTMLInputElement;
    return (e.value || e.getAttribute('aria-valuetext') || e.getAttribute('aria-valuenow') || e.textContent || '').trim();
  });
}

async function typeSpin(page: Page, name: string, text: string): Promise<void> {
  const spin = page.getByRole('spinbutton', { name }).first();
  await spin.click();
  await page.keyboard.type(text);
}

const DATE_BUTTON = /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4}$/;

/**
 * The month picker is a popover: on the real site it is not inside the "New reel" dialog, and the page behind shows
 * its own "November 2026" title. So the picker is found from its own "Next month" button (the nearest ancestor that
 * holds the day cells), and the month it shows is read from there, then reached by going forward or back.
 */
async function pickDate(page: Page, p: SlotParts): Promise<void> {
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: DATE_BUTTON }).first().click();
  const next = page.getByRole('button', { name: /next month/i }).first();
  await next.waitFor({ state: 'attached', timeout: 15000 });
  const picker = next.locator('xpath=ancestor::*[.//*[@role="gridcell"]][1]');
  const monthIndex = (y: number, m: number) => y * 12 + m;
  const target = monthIndex(p.year, p.month - 1);
  const shownMonth = async (): Promise<number | null> => {
    const texts = await picker.getByText(/^[A-Z][a-z]+ \d{4}$/).allInnerTexts().catch(() => [] as string[]);
    for (const t of texts) {
      const [name, year] = t.trim().split(' ');
      const m = MONTHS.indexOf(name);
      if (m >= 0) return monthIndex(Number(year), m);
    }
    return null;
  };
  for (let i = 0; i < 24; i++) {
    const now = await shownMonth();
    if (now === null) throw new SchedulerError('ui_changed', 'Could not read the month shown by the date picker');
    if (now === target) break;
    const btn = picker.getByRole('button', { name: now < target ? /next month/i : /previous month/i }).first();
    if (await btn.isDisabled().catch(() => false)) {
      throw new SchedulerError('too_far', `Instagram does not let you pick ${MONTHS[p.month - 1]} ${p.year} (the picker stops at ${MONTHS[(now % 12 + 12) % 12]} ${Math.floor(now / 12)})`);
    }
    await btn.click();
  }
  if ((await shownMonth()) !== target) throw new SchedulerError('ui_changed', `Month picker never showed ${MONTHS[p.month - 1]} ${p.year}`);
  // Cells of the neighbouring months are also grid cells: take the p.day-th cell starting at the first "1".
  const cells = picker.getByRole('gridcell');
  const texts = await cells.allInnerTexts();
  const start = texts.findIndex((t) => t.trim() === '1');
  const idx = start + p.day - 1;
  if (start < 0 || idx >= texts.length || texts[idx].trim() !== String(p.day)) {
    throw new SchedulerError('ui_changed', `Day ${p.day} not found in the month picker`);
  }
  const cell = cells.nth(idx);
  const disabled = await cell.evaluate((el) => {
    const e = el as HTMLElement;
    return e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' || !!e.closest('[aria-disabled="true"], [disabled]');
  });
  if (disabled) throw new SchedulerError('too_far', `Instagram does not allow ${MONTHS[p.month - 1]} ${p.day}, ${p.year}: too far ahead or in the past`);
  await cell.click();
}

/** Sets date and time in the open dialog (Create or Edit) and reads them back. */
export async function setDateTime(page: Page, slot: string): Promise<void> {
  const p = slotParts(slot);
  const dialog = page.getByRole('dialog').last();
  await pickDate(page, p);
  await typeSpin(page, 'Hours', p.hour12);
  await typeSpin(page, 'Minutes', p.minuteStr);
  await typeSpin(page, 'AM PM', p.ampm);
  const h = Number(await readSpin(page, 'Hours'));
  const mi = Number(await readSpin(page, 'Minutes'));
  const ap = (await readSpin(page, 'AM PM')).trim()[0]?.toUpperCase();
  if (h !== Number(p.hour12) || mi !== p.minute || ap !== p.ampm) {
    throw new SchedulerError('step_failed', `Time read back as ${h}:${mi} ${ap}, expected ${p.hour12}:${p.minuteStr} ${p.ampm}`);
  }
  const dateNow = await dialog.getByRole('button', { name: DATE_BUTTON }).first().innerText();
  if (dateNow.trim() !== p.dateLabel) throw new SchedulerError('step_failed', `Date is "${dateNow}", expected ${p.dateLabel}`);
}

/**
 * Instagram sometimes puts a one-time information notice on top of the Crop step
 * ("Video posts are now shared as reels", with a single OK button). Only notices on this list are dismissed:
 * they are plain notices that change nothing on the account. Anything else (a terms or consent dialog, a
 * security check) is left alone and the step fails with its screenshot, so a person decides.
 */
export const KNOWN_NOTICES: readonly RegExp[] = [/Video posts are now shared as reels/i];

export async function dismissKnownNotice(page: Page): Promise<boolean> {
  for (const title of KNOWN_NOTICES) {
    const notice = page.getByRole('dialog').filter({ hasText: title }).last();
    if (await notice.isVisible().catch(() => false)) {
      await notice.getByRole('button', { name: 'OK', exact: true }).click();
      return true;
    }
  }
  return false;
}

async function waitForCropStep(page: Page, dialog: () => ReturnType<Page['getByRole']>, timeoutMs: number = 90000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await dismissKnownNotice(page)) continue;
    if (await dialog().getByText('Crop', { exact: true }).first().isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
  }
  throw new SchedulerError('ui_changed', 'The Crop step did not appear after the upload (an unknown dialog may be covering it).');
}

export async function runFlow(page: Page, input: FlowInput, ctx: JobContext): Promise<void> {
  const p = slotParts(input.slot);
  let stepIndex = 0;
  const begin = async (i: number, log: string) => {
    check(ctx);
    stepIndex = i;
    ctx.update({ progress: i / STEPS.length, step: STEPS[i], stepIndex: i, log });
  };
  const dialog = () => page.getByRole('dialog').last();

  try {
    await begin(0, 'Opening the Schedule content dialog');
    await page.goto(input.url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Schedule content' }).first().click();
    await dialog().waitFor({ state: 'visible', timeout: 15000 });

    await begin(1, 'Uploading the video');
    await dialog().locator('input[type=file]').first().setInputFiles(input.videoPath);
    await waitForCropStep(page, dialog, input.cropTimeoutMs);

    await begin(2, 'Setting the crop to 9:16');
    await dialog().getByRole('button', { name: /select crop/i }).first().click();
    await page.getByText('9:16', { exact: true }).first().click();
    await dialog().getByRole('button', { name: 'Next', exact: true }).click();

    await begin(3, 'Uploading the cover');
    const cover = dialog().getByText('Cover photo', { exact: true }).first();
    await cover.waitFor({ timeout: 30000 });
    await dialog().locator('input[type=file]').last().setInputFiles(input.coverPath);
    await dialog().getByRole('button', { name: 'Next', exact: true }).click();

    await begin(4, 'Typing the caption');
    const box = dialog().locator('div[contenteditable=true][role=textbox]').first();
    await box.waitFor({ timeout: 30000 });
    await box.click();
    const lines = input.caption.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.keyboard.press('Enter');
      if (lines[i]) await page.keyboard.insertText(lines[i]);
    }
    const text = await box.evaluate((el) => (el as HTMLElement).innerText);
    const res = checkCaption(input.caption, text);
    if (!res.ok) throw new SchedulerError('caption_mismatch', res.problems.join('; '));
    ctx.update({ log: `Caption verified (${text.length} chars)` });

    await begin(5, `Setting ${p.dateLabel} ${p.timeLabel}`);
    const toggle = dialog().getByRole('switch', { name: /schedule/i }).first();
    if (await toggle.count() && !(await toggle.isChecked().catch(() => true))) await toggle.click();
    await setDateTime(page, input.slot);

    await begin(6, 'Pressing Schedule');
    await dialog().getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.getByText('Your reel has been scheduled.').waitFor({ timeout: 45000 });
    await input.onScheduled?.();
    await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => undefined);

    await begin(7, 'Verifying on the calendar');
    await verifyOnCalendar(page, input, p);
    ctx.update({ progress: 1, log: 'Scheduled and verified' });
  } catch (e) {
    throw e instanceof SchedulerError ? e : new SchedulerError('step_failed', `${STEPS[stepIndex]}: ${(e as Error).message}`);
  }
}

async function verifyOnCalendar(page: Page, input: FlowInput, p: SlotParts): Promise<void> {
  const { findPostOnCalendar } = await import('./ops.js');
  const iso = wallToIso(input.slot);
  const found = await findPostOnCalendar(page, input.url, captionStartOf(input.caption), iso);
  if (found !== 1) {
    throw new SchedulerError('verify_failed', found === 0 ? `Scheduled post not found on the calendar at ${p.dateLabel} ${p.timeLabel}` : `Found ${found} calendar items at ${p.dateLabel} ${p.timeLabel}, expected 1`);
  }
}
